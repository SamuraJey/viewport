import io
import shutil
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from PIL import Image, ImageOps
from pydantic import ValidationError

from viewport import rotation_tasks
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.project import Project
from viewport.models.user import User
from viewport.photo_rotation import compose_exif_rotation, get_photo_delivery_key, rotate_focal_point
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.rotation_tasks import _publish_rotation, create_rotated_file
from viewport.schemas.photo import GalleryPhotoResponse, PhotoRotationRequest


@pytest.mark.parametrize("orientation", range(1, 9))
@pytest.mark.parametrize("angle", (90, 180, 270))
def test_jpeg_rotation_preserves_compressed_pixels_and_composes_exif(tmp_path, orientation, angle):
    if not shutil.which("exiftool"):
        pytest.skip("ExifTool is not installed")
    source, output = tmp_path / "source.jpg", tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[274] = orientation
    exif[36867] = "2026:01:02 03:04:05"
    image = Image.new("RGB", (31, 19))
    image.putdata([(x * 7 % 256, x * 31 % 256, x * 13 % 256) for x in range(31 * 19)])
    image.save(source, exif=exif, quality=83)
    create_rotated_file(str(source), str(output), "image/jpeg", angle)
    with Image.open(source) as original, Image.open(output) as rotated:
        assert rotated.tobytes() == original.tobytes()
        assert rotated.getexif()[274] == compose_exif_rotation(orientation, angle)
        assert rotated.getexif()[36867] == original.getexif()[36867]
        expected = ImageOps.exif_transpose(original).rotate(-angle, expand=True)
        assert ImageOps.exif_transpose(rotated).tobytes() == expected.tobytes()
    # Everything from Start of Scan onward must remain byte-for-byte identical.
    assert source.read_bytes().split(b"\xff\xda", 1)[1] == output.read_bytes().split(b"\xff\xda", 1)[1]


def test_jpeg_without_exif_and_anonymous_source(tmp_path):
    import tempfile

    source = io.BytesIO()
    Image.new("RGB", (17, 23), "red").save(source, format="JPEG")
    with tempfile.TemporaryFile() as scratch:
        scratch.write(source.getvalue())
        scratch.flush()
        create_rotated_file(f"/proc/self/fd/{scratch.fileno()}", str(tmp_path / "rotated.jpg"), "image/jpeg", 270)
    with Image.open(tmp_path / "rotated.jpg") as image:
        assert image.getexif()[274] == 8


@pytest.mark.parametrize("angle", (90, 180, 270))
def test_png_rotation_keeps_alpha_and_pixels(tmp_path, angle):
    source, output = tmp_path / "source.png", tmp_path / "rotated.png"
    image = Image.new("RGBA", (31, 19))
    image.putdata([(x % 256, x * 3 % 256, x * 7 % 256, x * 11 % 256) for x in range(31 * 19)])
    image.save(source)
    create_rotated_file(str(source), str(output), "image/png", angle)
    with Image.open(output) as result:
        assert result.mode == "RGBA"
        assert result.size == image.rotate(-angle, expand=True).size
        assert result.tobytes() == image.rotate(-angle, expand=True).tobytes()


def test_focal_point_and_delivery_defaults():
    assert rotate_focal_point(20, 70, 90) == (30, 20)
    assert rotate_focal_point(20, 70, -90) == (70, 80)
    assert rotate_focal_point(20, 70, 360) == (20, 70)
    assert get_photo_delivery_key(SimpleNamespace(object_key="original.jpg")) == "original.jpg"
    assert get_photo_delivery_key(SimpleNamespace(object_key="original.jpg", rotated_object_key="rotated.jpg")) == "rotated.jpg"


def test_rotation_request_limits_and_duplicates():
    item = {"photo_id": str(uuid.uuid4()), "rotation": 90, "expected_revision": 0}
    for items in ([], [item, item], [{**item, "rotation": 45}], [{**item, "expected_revision": -1}]):
        with pytest.raises(ValidationError):
            PhotoRotationRequest(items=items)


@pytest.mark.asyncio
async def test_image_urls_use_published_rotation():
    photo = SimpleNamespace(
        id=uuid.uuid4(),
        gallery_id=uuid.uuid4(),
        media_type="image",
        object_key="original.jpg",
        rotated_object_key="rotated.jpg",
        thumbnail_object_key="rotated.avif",
        playback_object_key=None,
        duration_ms=None,
        width=400,
        height=800,
        status=2,
        processing_error=None,
        display_name="photo.jpg",
        file_size=100,
        uploaded_at=datetime.now(UTC),
        rotation=90,
        requested_rotation=180,
        rotation_revision=2,
        rotation_status="pending",
        rotation_error=None,
    )
    client = SimpleNamespace(
        generate_presigned_urls_batch=AsyncMock(return_value={"rotated.avif": "thumb-url"}),
        generate_presigned_urls_batch_for_dispositions=AsyncMock(return_value={"rotated.jpg": "full-url"}),
    )
    response = (await GalleryPhotoResponse.from_db_photos_batch([photo], client))[0]
    assert response.url == "full-url"
    assert response.thumbnail_url == "thumb-url"
    assert response.rotation == 90 and response.requested_rotation == 180
    assert "rotated.jpg" in client.generate_presigned_urls_batch_for_dispositions.call_args.args[0]


@pytest.mark.asyncio
async def test_repository_rotations_validate_owner_revision_and_media(db_session):
    owner = User(email="rotation@example.com", password_hash="hash", display_name="Owner")
    db_session.add(owner)
    await db_session.flush()
    gallery = Gallery(owner_id=owner.id, name="Rotation")
    db_session.add(gallery)
    await db_session.flush()
    photo = Photo(gallery_id=gallery.id, object_key="source.jpg", thumbnail_object_key="thumb.avif", display_name="photo.jpg", file_size=100, status=PhotoUploadStatus.SUCCESSFUL)
    video = Photo(gallery_id=gallery.id, object_key="source.mp4", thumbnail_object_key="poster.avif", display_name="video.mp4", file_size=100, status=PhotoUploadStatus.SUCCESSFUL, media_type="video")
    db_session.add_all([photo, video])
    await db_session.commit()
    repo = GalleryRepository(db_session)
    request = PhotoRotationRequest(items=[{"photo_id": photo.id, "rotation": 90, "expected_revision": 0}, {"photo_id": video.id, "rotation": 90, "expected_revision": 0}])
    results = await repo.request_photo_rotations(gallery.id, owner.id, request)
    assert [error for _, _, error in results] == [None, "not_ready"]
    assert photo.rotation == 0 and photo.requested_rotation == 90 and photo.rotation_revision == 1
    assert photo.status == PhotoUploadStatus.SUCCESSFUL
    assert await repo.pending_rotation_count(gallery.id) == 1
    results = await repo.request_photo_rotations(gallery.id, owner.id, request)
    assert results[0][2] == "conflict"
    with pytest.raises(ValueError):
        await repo.request_photo_rotations(gallery.id, uuid.uuid4(), request)
    await db_session.rollback()


def test_publication_is_atomic_and_rejects_stale_tasks(sync_engine):
    from sqlalchemy.orm import Session

    with Session(sync_engine) as db:
        owner = User(email="publish@example.com", password_hash="hash", display_name="Owner")
        db.add(owner)
        db.flush()
        project = Project(owner_id=owner.id, name="Project")
        db.add(project)
        db.flush()
        gallery = Gallery(owner_id=owner.id, project_id=project.id, name="Gallery", cover_focal_x=20, cover_focal_y=70)
        db.add(gallery)
        db.flush()
        photo = Photo(
            gallery_id=gallery.id,
            object_key="source.jpg",
            thumbnail_object_key="old.avif",
            display_name="photo.jpg",
            file_size=100,
            status=2,
            rotation_revision=2,
            requested_rotation=90,
            rotation_status="processing",
        )
        db.add(photo)
        db.flush()
        gallery.cover_photo_id = photo.id
        project.cover_photo_id = photo.id
        project.cover_focal_x, project.cover_focal_y = 20, 70
        photo_id = photo.id
        db.commit()
        assert not _publish_rotation(photo_id, 1, "stale.jpg", "stale.avif", 10, 20)
        assert _publish_rotation(photo_id, 2, "current.jpg", "current.avif", 10, 20)
        assert not _publish_rotation(photo_id, 2, "duplicate.jpg", "duplicate.avif", 10, 20)
        db.expire_all()
        assert photo.object_key == "source.jpg"
        assert photo.rotated_object_key == "current.jpg" and photo.thumbnail_object_key == "current.avif"
        assert photo.rotation == 90 and photo.rotation_status == "ready"
        assert (gallery.cover_focal_x, gallery.cover_focal_y) == (30, 20)
        assert (project.cover_focal_x, project.cover_focal_y) == (30, 20)


def seed_pending_rotation(sync_engine):
    from sqlalchemy.orm import Session

    with Session(sync_engine) as db:
        owner = User(email="worker@example.com", password_hash="hash", display_name="Owner", storage_used=100)
        db.add(owner)
        db.flush()
        gallery = Gallery(owner_id=owner.id, name="Worker")
        db.add(gallery)
        db.flush()
        photo = Photo(
            gallery_id=gallery.id,
            object_key="source.jpg",
            thumbnail_object_key="old.avif",
            display_name="photo.jpg",
            file_size=100,
            status=2,
            rotation_revision=1,
            requested_rotation=90,
            rotation_status="pending",
            source_content_type="image/jpeg",
            width=31,
            height=19,
            rotation_updated_at=datetime.now(UTC).replace(tzinfo=None),
        )
        db.add(photo)
        db.flush()
        photo_id = photo.id
        db.commit()
        return photo_id


def test_worker_publishes_versioned_assets_and_reset_uses_original(sync_engine, tmp_path, monkeypatch):
    from sqlalchemy.orm import Session

    photo_id = seed_pending_rotation(sync_engine)
    source = tmp_path / "source.jpg"
    Image.new("RGB", (31, 19), "red").save(source)

    @contextmanager
    def stream(*_args):
        yield str(source)

    client = MagicMock()
    monkeypatch.setattr(rotation_tasks, "get_s3_client", lambda: client)
    monkeypatch.setattr(rotation_tasks, "get_s3_settings", lambda: SimpleNamespace(bucket="bucket"))
    monkeypatch.setattr(rotation_tasks, "_stream_s3_object_to_tempfile", stream)
    monkeypatch.setattr(rotation_tasks, "create_thumbnail_from_path", lambda _path: (b"thumb", 19, 31))
    rotation_tasks.rotate_photo_task.run(str(photo_id), 1)
    with Session(sync_engine) as db:
        photo = db.get(Photo, photo_id)
        assert photo.rotation_status == "ready" and photo.rotation == 90
        assert f"{photo_id}_rotations/1-" in photo.rotated_object_key
        assert photo.rotated_object_key.endswith("/image.jpg")
        assert photo.object_key == "source.jpg" and photo.status == PhotoUploadStatus.SUCCESSFUL
        assert (photo.width, photo.height) == (19, 31)
        assert db.query(User).one().storage_used == 100
        photo.rotation_revision = 2
        photo.requested_rotation = 0
        photo.rotation_status = "pending"
        db.commit()
    rotation_tasks.rotate_photo_task.run(str(photo_id), 2)
    with Session(sync_engine) as db:
        photo = db.get(Photo, photo_id)
        assert photo.rotation_status == "ready" and photo.rotation == 0
        assert photo.rotated_object_key is None
        assert client.upload_fileobj.call_count == 1
        assert client.put_object.call_count == 2


def test_failed_rotation_keeps_published_photo_and_quota(sync_engine, tmp_path, monkeypatch):
    from sqlalchemy.orm import Session

    photo_id = seed_pending_rotation(sync_engine)

    @contextmanager
    def stream(*_args):
        yield str(tmp_path / "invalid.jpg")

    monkeypatch.setattr(rotation_tasks, "get_s3_client", MagicMock)
    monkeypatch.setattr(rotation_tasks, "get_s3_settings", lambda: SimpleNamespace(bucket="bucket"))
    monkeypatch.setattr(rotation_tasks, "_stream_s3_object_to_tempfile", stream)

    def invalid(*_args):
        raise ValueError("Invalid image")

    monkeypatch.setattr(rotation_tasks, "create_rotated_file", invalid)
    rotation_tasks.rotate_photo_task.run(str(photo_id), 1)
    with Session(sync_engine) as db:
        photo = db.get(Photo, photo_id)
        assert photo.rotation_status == "failed" and photo.rotation_error
        assert photo.rotation == 0 and photo.requested_rotation == 90
        assert photo.thumbnail_object_key == "old.avif" and photo.rotated_object_key is None
        assert photo.status == PhotoUploadStatus.SUCCESSFUL
        assert db.query(User).one().storage_used == 100


@pytest.mark.asyncio
async def test_rotation_api_keeps_committed_intent_when_broker_is_unavailable(monkeypatch):
    from viewport.api.photo import rotate_photos

    photo_id, gallery_id, owner_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    photo = SimpleNamespace(id=photo_id, rotation_revision=1)
    repo = SimpleNamespace(
        request_photo_rotations=AsyncMock(return_value=[(photo_id, photo, None)]),
        pending_rotation_count=AsyncMock(return_value=1),
    )
    response_photo = GalleryPhotoResponse(
        id=photo_id,
        media_type="image",
        status="successful",
        url="published.jpg",
        thumbnail_url="published.avif",
        filename="photo.jpg",
        file_size=100,
        uploaded_at=datetime.now(UTC),
        rotation=0,
        requested_rotation=90,
        rotation_revision=1,
        rotation_status="pending",
    )
    monkeypatch.setattr(GalleryPhotoResponse, "from_db_photos_batch", AsyncMock(return_value=[response_photo]))
    enqueue = MagicMock(side_effect=RuntimeError("Broker unavailable"))
    monkeypatch.setattr(rotation_tasks.rotate_photo_task, "delay", enqueue)
    request = PhotoRotationRequest(items=[{"photo_id": photo_id, "rotation": 90, "expected_revision": 0}])
    response = await rotate_photos(gallery_id, request, repo, SimpleNamespace(id=owner_id), MagicMock())
    repo.request_photo_rotations.assert_awaited_once_with(gallery_id, owner_id, request)
    enqueue.assert_called_once_with(str(photo_id), 1)
    assert response.pending_rotation_count == 1
    assert response.results[0].photo.rotation_status == "pending"


@pytest.mark.asyncio
async def test_rotation_status_rejects_foreign_gallery_before_loading_photos():
    from fastapi import HTTPException

    from viewport.api.photo import get_rotation_status

    repo = SimpleNamespace(get_gallery_by_id_and_owner=AsyncMock(return_value=None), get_photos_by_ids_and_gallery=AsyncMock())
    with pytest.raises(HTTPException) as error:
        await get_rotation_status(uuid.uuid4(), [uuid.uuid4()], repo, SimpleNamespace(id=uuid.uuid4()), MagicMock())
    assert error.value.status_code == 404
    repo.get_photos_by_ids_and_gallery.assert_not_awaited()


def test_reconciler_recovers_stale_worker_and_does_not_enqueue_twice(sync_engine, monkeypatch):
    from sqlalchemy.orm import Session

    photo_id = seed_pending_rotation(sync_engine)
    with Session(sync_engine) as db:
        photo = db.get(Photo, photo_id)
        photo.rotation_status = "processing"
        photo.rotation_updated_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=36)
        db.commit()
    enqueue = MagicMock()
    monkeypatch.setattr(rotation_tasks.rotate_photo_task, "delay", enqueue)
    rotation_tasks.reconcile_photo_rotations_task.run()
    rotation_tasks.reconcile_photo_rotations_task.run()
    enqueue.assert_called_once_with(str(photo_id), 1)
    with Session(sync_engine) as db:
        assert db.get(Photo, photo_id).rotation_status == "pending"


def test_cleanup_protects_active_assets_and_superseded_url_lifetime(sync_engine, monkeypatch):
    from sqlalchemy.orm import Session

    photo_id = seed_pending_rotation(sync_engine)
    prefix = f"gallery/{photo_id}_rotations/"
    current, old = prefix + "current/image.jpg", prefix + "old/image.jpg"
    with Session(sync_engine) as db:
        photo = db.get(Photo, photo_id)
        photo.rotated_object_key = current
        # Old objects might have been superseded only moments ago.
        photo.rotation_updated_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1)
        db.commit()
    client = MagicMock()
    client.get_paginator.return_value.paginate.return_value = [{"Contents": [{"Key": key, "LastModified": datetime.now(UTC) - timedelta(hours=10)} for key in [current, old]]}]
    monkeypatch.setattr(rotation_tasks, "get_s3_client", lambda: client)
    monkeypatch.setattr(rotation_tasks, "get_s3_settings", lambda: SimpleNamespace(bucket="bucket"))
    rotation_tasks.cleanup_photo_rotation_versions_task.run()
    client.delete_object.assert_not_called()
    with Session(sync_engine) as db:
        db.get(Photo, photo_id).rotation_updated_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=4)
        db.commit()
    rotation_tasks.cleanup_photo_rotation_versions_task.run()
    client.delete_object.assert_called_once_with(Bucket="bucket", Key=old)


@pytest.mark.asyncio
async def test_private_download_blocks_pending_edits_and_uses_published_asset():
    from fastapi import HTTPException

    from viewport.api.photo import download_photo

    photo = SimpleNamespace(id=uuid.uuid4(), object_key="original.jpg", rotated_object_key="edited.jpg", display_name="photo.jpg", rotation_status="pending")
    repo = SimpleNamespace(get_gallery_by_id_and_owner=AsyncMock(return_value=object()), get_photo_by_id_and_gallery=AsyncMock(return_value=photo))
    s3 = SimpleNamespace(generate_presigned_url_async=AsyncMock(return_value="https://example.com/edited.jpg"))
    with pytest.raises(HTTPException) as error:
        await download_photo(uuid.uuid4(), photo.id, repo, SimpleNamespace(id=uuid.uuid4()), s3)
    assert error.value.status_code == 409
    s3.generate_presigned_url_async.assert_not_called()
    photo.rotation_status = "ready"
    response = await download_photo(uuid.uuid4(), photo.id, repo, SimpleNamespace(id=uuid.uuid4()), s3)
    assert response.status_code == 303
    assert s3.generate_presigned_url_async.call_args.args[0] == "edited.jpg"


@pytest.mark.asyncio
async def test_public_download_keeps_last_published_version_during_rotation(monkeypatch):
    from viewport.api import public

    photo = SimpleNamespace(id=uuid.uuid4(), object_key="original.jpg", rotated_object_key="edited.jpg", display_name="photo.jpg", rotation_status="processing")
    monkeypatch.setattr(public, "_get_downloadable_public_photo", AsyncMock(return_value=photo))
    repo = SimpleNamespace(record_single_download=AsyncMock())
    s3 = SimpleNamespace(generate_presigned_url_async=AsyncMock(return_value="https://example.com/edited.jpg"))
    response = await public.download_public_photo(uuid.uuid4(), photo.id, repo, SimpleNamespace(id=uuid.uuid4()), s3)
    assert response.status_code == 303
    assert s3.generate_presigned_url_async.call_args.args[0] == "edited.jpg"
    repo.record_single_download.assert_awaited_once()


@pytest.mark.asyncio
async def test_private_zip_uses_published_assets_and_blocks_pending(monkeypatch):
    import zipfile

    from fastapi import HTTPException

    from viewport.api import gallery

    photo = SimpleNamespace(id=uuid.uuid4(), object_key="original.jpg", rotated_object_key="edited.jpg", display_name="photo.jpg", rotation_status="ready")
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": io.BytesIO(b"edited image")}
    monkeypatch.setattr(gallery, "get_sync_s3_client", lambda: s3)
    monkeypatch.setattr(gallery, "get_s3_settings", lambda: SimpleNamespace(bucket="bucket"))
    response = gallery._build_gallery_zip_response(uuid.uuid4(), [photo], "gallery.zip")
    data = b"".join([chunk async for chunk in response.body_iterator])
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.read("photo.jpg") == b"edited image"
    s3.get_object.assert_called_once_with(Bucket="bucket", Key="edited.jpg")
    photo.rotation_status = "pending"
    with pytest.raises(HTTPException) as error:
        gallery._build_gallery_zip_response(uuid.uuid4(), [photo], "gallery.zip")
    assert error.value.status_code == 409
