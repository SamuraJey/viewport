import uuid
from datetime import UTC, date, datetime

import pytest

from viewport.models.gallery import PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository


@pytest.fixture
def owner_id(db_session) -> uuid.UUID:
    owner = User(email=f"owner-{uuid.uuid4()}@example.com", password_hash="testpassword", display_name="test user")
    db_session.add(owner)
    db_session.commit()
    return owner.id


@pytest.fixture
def repo(db_session):
    return GalleryRepository(db_session)


class DummyAsyncS3Client:
    def __init__(self):
        self.deleted_folders = []
        self.deleted_files = []
        self.renamed_pairs = []

    async def delete_folder(self, prefix: str) -> None:
        self.deleted_folders.append(prefix)

    async def delete_file(self, key: str) -> None:
        self.deleted_files.append(key)

    async def rename_file(self, old: str, new: str) -> None:
        self.renamed_pairs.append((old, new))


class RaisingRenameS3Client(DummyAsyncS3Client):
    async def rename_file(self, old: str, new: str) -> None:
        raise RuntimeError("rename failed")


def test_create_and_fetch_gallery(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Holiday")

    fetched, total = repo.get_galleries_by_owner(owner_id, page=1, size=10)
    assert total == 1
    assert fetched[0].id == gallery.id

    assert repo.get_gallery_by_id_and_owner(gallery.id, owner_id)


def test_update_gallery(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Trip")
    updated = repo.update_gallery(gallery.id, owner_id, name="Summer Trip", shooting_date=date(2023, 1, 1))
    assert updated is not None
    assert updated.name == "Summer Trip"
    assert updated.shooting_date == date(2023, 1, 1)

    unchanged = repo.update_gallery(gallery.id, owner_id)
    assert unchanged is not None
    assert unchanged.name == "Summer Trip"


def test_delete_gallery(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "To Delete")
    dummy = DummyAsyncS3Client()
    assert repo.delete_gallery(gallery.id, owner_id, dummy)
    assert repo.get_gallery_by_id_and_owner(gallery.id, owner_id) is None
    assert repo.delete_gallery(gallery.id, owner_id, dummy) is False


@pytest.mark.asyncio
async def test_delete_gallery_async_calls_s3(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Async")
    dummy = DummyAsyncS3Client()
    result = await repo.delete_gallery_async(gallery.id, owner_id, dummy)
    assert result is True
    assert dummy.deleted_folders == [f"{gallery.id}/"]


@pytest.mark.asyncio
async def test_delete_gallery_async_missing(repo, owner_id):
    dummy = DummyAsyncS3Client()
    assert await repo.delete_gallery_async(uuid.uuid4(), owner_id, dummy) is False
    assert dummy.deleted_folders == []


def _create_photo(repo, gallery_id: uuid.UUID, filename: str, owner_id: uuid.UUID) -> uuid.UUID:
    photo = repo.create_photo(gallery_id, f"{gallery_id}/{filename}", f"{gallery_id}/thumb-{filename}", 1024, width=10, height=10)
    return photo.id


def test_photo_queries(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Album")
    photo_id = _create_photo(repo, gallery.id, "photo.jpg", owner_id)

    assert repo.get_photo_by_id_and_gallery(photo_id, gallery.id)
    assert repo.get_photo_by_id_and_owner(photo_id, owner_id)
    photos = repo.get_photos_by_gallery_id(gallery.id)
    assert len(photos) == 1

    assert repo.get_photos_by_ids_and_gallery(gallery.id, []) == []


def test_cover_photo(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Cover")
    photo_id = _create_photo(repo, gallery.id, "cover.jpg", owner_id)

    assert repo.set_cover_photo(gallery.id, photo_id, owner_id)
    assert repo.clear_cover_photo(gallery.id, owner_id)
    assert repo.set_cover_photo(gallery.id, uuid.uuid4(), owner_id) is None
    assert repo.set_cover_photo(gallery.id, photo_id, uuid.uuid4()) is None


def test_photo_status_updates(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Status")
    photo_id = _create_photo(repo, gallery.id, "status.jpg", owner_id)
    photo = repo.get_photo_by_id_and_gallery(photo_id, gallery.id)
    assert photo

    updated = repo.set_photo_status(photo, PhotoUploadStatus.SUCCESSFUL)
    assert updated.status == PhotoUploadStatus.SUCCESSFUL

    repo.set_photos_statuses({photo.id: photo}, {})
    repo.set_photos_statuses({photo.id: photo}, {photo.id: PhotoUploadStatus.FAILED})
    assert photo.status == PhotoUploadStatus.FAILED


def test_create_photos_batch(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Batch")
    photos = repo.create_photos_batch(
        [
            {
                "gallery_id": gallery.id,
                "object_key": f"{gallery.id}/batch1.jpg",
                "thumbnail_object_key": f"{gallery.id}/batch1.jpg",
                "file_size": 10,
            },
            {
                "gallery_id": gallery.id,
                "object_key": f"{gallery.id}/batch2.jpg",
                "thumbnail_object_key": f"{gallery.id}/batch2.jpg",
                "file_size": 20,
            },
        ],
    )
    assert len(photos) == 2


def test_delete_photo(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Del Photo")
    photo_id = _create_photo(repo, gallery.id, "delete.jpg", owner_id)
    dummy = DummyAsyncS3Client()

    assert repo.delete_photo(photo_id, gallery.id, owner_id, dummy)
    assert repo.delete_photo(photo_id, gallery.id, owner_id, dummy) is False


@pytest.mark.asyncio
async def test_delete_photo_async(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Async Photo")
    photo_id = repo.create_photo(gallery.id, f"{gallery.id}/async.jpg", f"{gallery.id}/thumb-async.jpg", 5).id
    photo = repo.get_photo_by_id_and_gallery(photo_id, gallery.id)
    assert photo

    dummy = DummyAsyncS3Client()
    result = await repo.delete_photo_async(photo.id, gallery.id, owner_id, dummy)
    assert result is True
    assert f"{gallery.id}/async.jpg" in dummy.deleted_files
    assert f"{gallery.id}/thumb-async.jpg" in dummy.deleted_files

    missing = await repo.delete_photo_async(photo.id, gallery.id, owner_id, dummy)
    assert missing is False


def test_rename_photo(repo, owner_id, monkeypatch):
    gallery = repo.create_gallery(owner_id, "Rename")
    photo_id = repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/old.jpg", 5).id
    cleared = []

    monkeypatch.setattr("viewport.cache_utils.clear_presigned_url_cache", lambda key: cleared.append(key))

    renamed = repo.rename_photo(photo_id, gallery.id, owner_id, "new.jpg", DummyAsyncS3Client())
    assert renamed
    assert renamed.object_key.endswith("/new.jpg")
    assert cleared

    assert repo.rename_photo(uuid.uuid4(), gallery.id, owner_id, "fail.jpg", DummyAsyncS3Client()) is None


@pytest.mark.asyncio
async def test_rename_photo_async(repo, owner_id, monkeypatch):
    gallery = repo.create_gallery(owner_id, "Async Rename")
    photo = repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/thumb-old.jpg", 5)
    cleared = []
    monkeypatch.setattr("viewport.cache_utils.clear_presigned_url_cache", lambda key: cleared.append(key))

    picking = DummyAsyncS3Client()
    result = await repo.rename_photo_async(photo.id, gallery.id, owner_id, "new.jpg", picking)
    assert result
    assert picking.renamed_pairs
    assert len(cleared) >= 2

    failing = RaisingRenameS3Client()
    assert await repo.rename_photo_async(photo.id, gallery.id, owner_id, "bad.jpg", failing) is None


def test_sharelink_management(repo, owner_id):
    gallery = repo.create_gallery(owner_id, "Share")
    link = repo.create_sharelink(gallery.id, datetime.now(UTC))
    assert isinstance(link, ShareLink)

    assert repo.delete_sharelink(link.id, gallery.id, owner_id)
    assert not repo.delete_sharelink(link.id, gallery.id, owner_id)
    assert not repo.delete_sharelink(uuid.uuid4(), gallery.id, uuid.uuid4())
