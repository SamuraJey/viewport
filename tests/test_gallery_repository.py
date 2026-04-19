import uuid
from datetime import UTC, date, datetime

import pytest
import pytest_asyncio

from viewport.models.gallery import PhotoUploadStatus
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder


@pytest_asyncio.fixture
async def owner_id(db_session) -> uuid.UUID:
    owner = User(email=f"owner-{uuid.uuid4()}@example.com", password_hash="testpassword", display_name="test user")
    db_session.add(owner)
    await db_session.commit()
    return owner.id


@pytest_asyncio.fixture
async def repo(db_session) -> GalleryRepository:
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


@pytest.mark.asyncio
async def test_create_and_fetch_gallery(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Holiday")

    fetched, total = await repo.get_galleries_by_owner(owner_id, page=1, size=10)
    assert total == 1
    assert fetched[0].id == gallery.id
    assert repo.db.in_transaction() is False

    assert await repo.get_gallery_by_id_and_owner(gallery.id, owner_id)
    assert repo.db.in_transaction() is False


@pytest.mark.asyncio
async def test_update_gallery(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Trip")
    updated = await repo.update_gallery(gallery.id, owner_id, name="Summer Trip", shooting_date=date(2023, 1, 1))
    assert updated is not None
    assert updated.name == "Summer Trip"
    assert updated.shooting_date == date(2023, 1, 1)

    unchanged = await repo.update_gallery(gallery.id, owner_id)
    assert unchanged is not None
    assert unchanged.name == "Summer Trip"


@pytest.mark.asyncio
async def test_get_galleries_by_owner_filters_by_project_id(repo: GalleryRepository, owner_id):
    first_project = Project(owner_id=owner_id, name="Project One")
    second_project = Project(owner_id=owner_id, name="Project Two")
    repo.db.add_all([first_project, second_project])
    await repo.db.commit()

    first_gallery = await repo.create_gallery(owner_id, "First Project", project_id=first_project.id)
    await repo.create_gallery(owner_id, "Second Project", project_id=second_project.id)

    galleries, total = await repo.get_galleries_by_owner(
        owner_id,
        page=1,
        size=10,
        project_id=first_project.id,
    )

    assert total == 1
    assert [gallery.id for gallery in galleries] == [first_gallery.id]


@pytest.mark.asyncio
async def test_update_gallery_resets_position_when_detached_from_project(repo: GalleryRepository, owner_id):
    project = Project(owner_id=owner_id, name="Detached Project")
    repo.db.add(project)
    await repo.db.commit()

    gallery = await repo.create_gallery(
        owner_id,
        "Attached",
        project_id=project.id,
        project_position=7,
    )

    updated = await repo.update_gallery(
        gallery.id,
        owner_id,
        project_id=None,
        fields_set={"project_id"},
    )

    assert updated is not None
    assert updated.project_id is None
    assert updated.project_position == 0


@pytest.mark.asyncio
async def test_delete_gallery(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "To Delete")
    dummy = DummyAsyncS3Client()
    assert await repo.delete_gallery(gallery.id, owner_id, dummy)
    assert await repo.get_gallery_by_id_and_owner(gallery.id, owner_id) is None
    assert await repo.delete_gallery(gallery.id, owner_id, dummy) is False


@pytest.mark.asyncio
async def test_delete_gallery_uses_single_transaction_for_quota_updates(repo: GalleryRepository, owner_id, monkeypatch):
    gallery = await repo.create_gallery(owner_id, "Tx Delete")
    calls: list[tuple[str, int, bool]] = []

    async def _mock_decrement_storage_used(self, user_id, bytes_to_decrement, commit=True):
        calls.append(("used", int(bytes_to_decrement), commit))

    async def _mock_release_reserved_storage(self, user_id, bytes_to_release, commit=True):
        calls.append(("reserved", int(bytes_to_release), commit))

    monkeypatch.setattr("viewport.repositories.gallery_repository.UserRepository.decrement_storage_used", _mock_decrement_storage_used)
    monkeypatch.setattr("viewport.repositories.gallery_repository.UserRepository.release_reserved_storage", _mock_release_reserved_storage)

    assert await repo.delete_gallery(gallery.id, owner_id, DummyAsyncS3Client()) is True
    assert ("used", 0, False) in calls
    assert ("reserved", 0, False) in calls


@pytest.mark.asyncio
async def test_delete_gallery_async_missing(repo: GalleryRepository, owner_id):
    dummy = DummyAsyncS3Client()
    assert await repo.delete_gallery_async(uuid.uuid4(), owner_id, dummy) is False
    assert dummy.deleted_folders == []


@pytest.mark.asyncio
async def test_delete_photo_uses_single_transaction_for_quota_updates(repo: GalleryRepository, owner_id, monkeypatch):
    gallery = await repo.create_gallery(owner_id, "Photo Tx")
    photo = await repo.create_photo(gallery.id, f"{gallery.id}/photo.jpg", f"{gallery.id}/photo.jpg", 1024)
    photo.status = PhotoUploadStatus.SUCCESSFUL
    repo.db.add(photo)
    await repo.db.commit()

    calls: list[tuple[str, int, bool]] = []

    async def _mock_decrement_storage_used(self, user_id, bytes_to_decrement, commit=True):
        calls.append(("used", int(bytes_to_decrement), commit))

    async def _mock_release_reserved_storage(self, user_id, bytes_to_release, commit=True):
        calls.append(("reserved", int(bytes_to_release), commit))

    monkeypatch.setattr("viewport.repositories.gallery_repository.UserRepository.decrement_storage_used", _mock_decrement_storage_used)
    monkeypatch.setattr("viewport.repositories.gallery_repository.UserRepository.release_reserved_storage", _mock_release_reserved_storage)

    assert await repo.delete_photo(photo.id, gallery.id, owner_id, DummyAsyncS3Client()) is True
    assert ("used", 1024, False) in calls
    assert not any(c[0] == "reserved" for c in calls)


async def _create_photo(repo: GalleryRepository, gallery_id: uuid.UUID, filename: str, owner_id: uuid.UUID) -> uuid.UUID:
    photo = await repo.create_photo(gallery_id, f"{gallery_id}/{filename}", f"{gallery_id}/thumb-{filename}", 1024, width=10, height=10)
    return photo.id


@pytest.mark.asyncio
async def test_photo_queries(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Album")
    photo_id = await _create_photo(repo, gallery.id, "photo.jpg", owner_id)

    assert await repo.get_photo_by_id_and_gallery(photo_id, gallery.id)
    assert await repo.get_photo_by_id_and_owner(photo_id, owner_id)
    photos = await repo.get_photos_by_gallery_id(gallery.id)
    assert len(photos) == 1
    assert repo.db.in_transaction() is False

    assert await repo.get_photos_by_ids_and_gallery(gallery.id, []) == []


@pytest.mark.asyncio
async def test_gallery_photo_search_sort_and_filtered_count(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Search Sort")
    other_gallery = await repo.create_gallery(owner_id, "Other")

    photo_alpha = await repo.create_photo(
        gallery.id,
        f"{gallery.id}/alpha.jpg",
        f"{gallery.id}/alpha.jpg",
        100,
        display_name="Alpha.jpg",
    )
    photo_beta = await repo.create_photo(
        gallery.id,
        f"{gallery.id}/beta.jpg",
        f"{gallery.id}/beta.jpg",
        300,
        display_name="beta.jpg",
    )
    photo_zeta = await repo.create_photo(
        gallery.id,
        f"{gallery.id}/zeta.jpg",
        f"{gallery.id}/zeta.jpg",
        200,
        display_name="zeta.jpg",
    )

    await repo.create_photo(
        other_gallery.id,
        f"{other_gallery.id}/beta.jpg",
        f"{other_gallery.id}/beta.jpg",
        999,
        display_name="beta.jpg",
    )

    photo_alpha.uploaded_at = datetime(2026, 3, 20, 10, 0, tzinfo=UTC)
    photo_beta.uploaded_at = datetime(2026, 3, 21, 10, 0, tzinfo=UTC)
    photo_zeta.uploaded_at = datetime(2026, 3, 22, 10, 0, tzinfo=UTC)
    await repo.db.commit()

    filtered_count = await repo.get_photo_count_by_gallery(gallery.id, search="ta")
    assert filtered_count == 2

    filtered_photos = await repo.get_photos_by_gallery_paginated(
        gallery_id=gallery.id,
        limit=10,
        offset=0,
        search="TA",
        sort_by=GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order=SortOrder.ASC,
    )
    assert [photo.display_name for photo in filtered_photos] == ["beta.jpg", "zeta.jpg"]

    by_size_desc = await repo.get_photos_by_gallery_paginated(
        gallery_id=gallery.id,
        limit=3,
        offset=0,
        sort_by=GalleryPhotoSortBy.FILE_SIZE,
        order=SortOrder.DESC,
    )
    assert [photo.file_size for photo in by_size_desc] == [300, 200, 100]

    by_uploaded_desc = await repo.get_photos_by_gallery_paginated(
        gallery_id=gallery.id,
        limit=3,
        offset=0,
        sort_by=GalleryPhotoSortBy.UPLOADED_AT,
        order=SortOrder.DESC,
    )
    assert [photo.display_name for photo in by_uploaded_desc] == ["zeta.jpg", "beta.jpg", "Alpha.jpg"]


@pytest.mark.asyncio
async def test_gallery_photo_search_escapes_like_metacharacters(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Literal Search")

    await repo.create_photo(
        gallery.id,
        f"{gallery.id}/contains-percent.jpg",
        f"{gallery.id}/contains-percent.jpg",
        100,
        display_name="invoice-100%-final.jpg",
    )
    await repo.create_photo(
        gallery.id,
        f"{gallery.id}/no-percent.jpg",
        f"{gallery.id}/no-percent.jpg",
        100,
        display_name="invoice-1000-final.jpg",
    )
    await repo.create_photo(
        gallery.id,
        f"{gallery.id}/contains-underscore.jpg",
        f"{gallery.id}/contains-underscore.jpg",
        100,
        display_name="frame_01.jpg",
    )
    await repo.create_photo(
        gallery.id,
        f"{gallery.id}/no-underscore.jpg",
        f"{gallery.id}/no-underscore.jpg",
        100,
        display_name="frameA01.jpg",
    )

    percent_matches = await repo.get_photos_by_gallery_paginated(
        gallery_id=gallery.id,
        limit=20,
        offset=0,
        search="100%",
        sort_by=GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order=SortOrder.ASC,
    )
    assert [photo.display_name for photo in percent_matches] == ["invoice-100%-final.jpg"]

    underscore_matches = await repo.get_photos_by_gallery_paginated(
        gallery_id=gallery.id,
        limit=20,
        offset=0,
        search="frame_",
        sort_by=GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order=SortOrder.ASC,
    )
    assert [photo.display_name for photo in underscore_matches] == ["frame_01.jpg"]


@pytest.mark.asyncio
async def test_cover_photo(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Cover")
    photo_id = await _create_photo(repo, gallery.id, "cover.jpg", owner_id)

    assert await repo.set_cover_photo(gallery.id, photo_id, owner_id)
    assert await repo.clear_cover_photo(gallery.id, owner_id)
    assert await repo.set_cover_photo(gallery.id, uuid.uuid4(), owner_id) is None
    assert await repo.set_cover_photo(gallery.id, photo_id, uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_update_sharelink_returns_none_for_missing_gallery_or_sharelink(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Shares")
    sharelink = await repo.create_sharelink(gallery.id, expires_at=None)

    assert (
        await repo.update_sharelink(
            sharelink.id,
            gallery.id,
            uuid.uuid4(),
            fields_set={"label"},
            label="new label",
        )
        is None
    )

    assert (
        await repo.update_sharelink(
            uuid.uuid4(),
            gallery.id,
            owner_id,
            fields_set={"label"},
            label="new label",
        )
        is None
    )


@pytest.mark.asyncio
async def test_photo_status_updates(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Status")
    photo_id = await _create_photo(repo, gallery.id, "status.jpg", owner_id)
    photo = await repo.get_photo_by_id_and_gallery(photo_id, gallery.id)
    assert photo

    updated = await repo.set_photo_status(photo, PhotoUploadStatus.SUCCESSFUL)
    assert updated.status == PhotoUploadStatus.SUCCESSFUL

    await repo.set_photos_statuses({photo.id: photo}, {})
    await repo.set_photos_statuses({photo.id: photo}, {photo.id: PhotoUploadStatus.FAILED})
    assert photo.status == PhotoUploadStatus.FAILED


@pytest.mark.asyncio
async def test_create_photos_batch(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Batch")
    photos = await repo.create_photos_batch(
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


@pytest.mark.asyncio
async def test_create_photos_batch_retry_dedupes_case_insensitive_collisions_within_batch(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Batch Collision Retry")

    # Existing DB row forces retry path when one of incoming names collides.
    await repo.create_photo(
        gallery.id,
        f"{gallery.id}/existing.jpg",
        f"{gallery.id}/existing.jpg",
        10,
        display_name="dup.jpg",
    )

    photos = await repo.create_photos_batch(
        [
            {
                "gallery_id": gallery.id,
                "object_key": f"{gallery.id}/new-1.jpg",
                "thumbnail_object_key": f"{gallery.id}/new-1.jpg",
                "file_size": 10,
                "display_name": "dup.jpg",
            },
            {
                "gallery_id": gallery.id,
                "object_key": f"{gallery.id}/new-2.jpg",
                "thumbnail_object_key": f"{gallery.id}/new-2.jpg",
                "file_size": 10,
                "display_name": "Dup.JPG",
            },
        ],
    )

    assert len(photos) == 2
    lower_names = {photo.display_name.lower() for photo in photos}
    assert len(lower_names) == 2
    assert "dup.jpg" not in lower_names


@pytest.mark.asyncio
async def test_delete_photo(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Del Photo")
    photo_id = await _create_photo(repo, gallery.id, "delete.jpg", owner_id)
    dummy = DummyAsyncS3Client()

    assert await repo.delete_photo(photo_id, gallery.id, owner_id, dummy)
    assert await repo.delete_photo(photo_id, gallery.id, owner_id, dummy) is False


@pytest.mark.asyncio
async def test_rename_photo(repo: GalleryRepository, owner_id, monkeypatch):
    gallery = await repo.create_gallery(owner_id, "Rename")
    photo_id = (await repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/old.jpg", 5)).id

    renamed = await repo.rename_photo(photo_id, gallery.id, owner_id, "new.jpg")
    assert renamed
    assert renamed.object_key.endswith("/old.jpg")
    assert renamed.display_name == "new.jpg"

    assert await repo.rename_photo(uuid.uuid4(), gallery.id, owner_id, "fail.jpg") is None


@pytest.mark.asyncio
async def test_rename_photo_sanitizes_unsafe_filename(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Rename sanitize")
    photo = await repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/old.jpg", 5)

    renamed = await repo.rename_photo(photo.id, gallery.id, owner_id, "../bad\\name\x00?.jpg")
    assert renamed is not None
    assert renamed.display_name == "badname.jpg"


@pytest.mark.asyncio
async def test_rename_photo_async(repo: GalleryRepository, owner_id, monkeypatch):
    gallery = await repo.create_gallery(owner_id, "Async Rename")
    photo = await repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/thumb-old.jpg", 5)

    result = await repo.rename_photo_async(photo.id, gallery.id, owner_id, "new.jpg")
    assert result
    assert result.object_key.endswith("/old.jpg")
    assert result.display_name == "new.jpg"

    failed_result = await repo.rename_photo_async(photo.id, gallery.id, owner_id, "bad.jpg")
    assert failed_result is not None
    assert failed_result.display_name == "bad.jpg"


@pytest.mark.asyncio
async def test_rename_photo_async_sanitizes_unsafe_filename(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Async Rename sanitize")
    photo = await repo.create_photo(gallery.id, f"{gallery.id}/old.jpg", f"{gallery.id}/thumb-old.jpg", 5)

    renamed = await repo.rename_photo_async(photo.id, gallery.id, owner_id, "/\\\x00??")
    assert renamed is not None
    assert renamed.display_name == "file"


@pytest.mark.asyncio
async def test_sharelink_management(repo: GalleryRepository, owner_id):
    gallery = await repo.create_gallery(owner_id, "Share")
    link = await repo.create_sharelink(gallery.id, datetime.now(UTC))
    assert isinstance(link, ShareLink)

    assert await repo.delete_sharelink(link.id, gallery.id, owner_id)
    assert not await repo.delete_sharelink(link.id, gallery.id, owner_id)
    assert not await repo.delete_sharelink(uuid.uuid4(), gallery.id, uuid.uuid4())
