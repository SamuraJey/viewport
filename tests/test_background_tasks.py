import io
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from PIL import Image
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.s3_utils import S3Settings, get_s3_client, upload_fileobj
from viewport.task_utils import BatchTaskResult
from viewport.tasks import photo_tasks
from viewport.tasks.maintenance_tasks import delete_gallery_data_task_impl, reconcile_storage_quotas_task_impl, reconcile_successful_uploads_task_impl
from viewport.tasks.photo_tasks import _batch_update_photo_results, create_thumbnails_batch_task_impl

IMAGE_SIZE = (640, 480)


class PhotoSetup(NamedTuple):
    photo_id: str
    gallery_id: str
    user_id: str
    object_key: str


@asynccontextmanager
async def session_scope(engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    session_local = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_local() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def _create_dummy_jpeg_bytes(width: int = IMAGE_SIZE[0], height: int = IMAGE_SIZE[1]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "orange").save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    return buffer.read()


@asynccontextmanager
async def photo_context(engine: AsyncEngine, gallery_name: str, filename: str, content: bytes | None = None):
    if content is None:
        content = _create_dummy_jpeg_bytes()

    async with session_scope(engine) as session:
        user = User(email=f"user-{uuid4()}@example.com", password_hash="hashed", display_name="TestUser")
        session.add(user)
        await session.flush()

        gallery = Gallery(owner_id=user.id, name=gallery_name)
        session.add(gallery)
        await session.flush()

        object_key = f"{gallery.id}/{filename}"
        upload_fileobj(content, object_key, content_type="image/jpeg")

        photo = Photo(
            gallery_id=gallery.id,
            object_key=object_key,
            thumbnail_object_key=object_key,
            file_size=len(content),
        )
        session.add(photo)
        await session.flush()

        ctx = PhotoSetup(photo.id, gallery.id, user.id, object_key)

    try:
        yield ctx
    finally:
        async with session_scope(engine) as session:
            await session.execute(delete(Photo).where(Photo.id == ctx.photo_id))
            await session.execute(delete(Gallery).where(Gallery.id == ctx.gallery_id))
            await session.execute(delete(User).where(User.id == ctx.user_id))


def assert_batch_counts(result, successful=0, failed=0, skipped=0):
    assert result["successful"] == successful
    assert result["failed"] == failed
    assert result["skipped"] == skipped


@pytest.mark.asyncio
async def test_create_thumbnails_batch_task_creates_thumbnail(engine: AsyncEngine, s3_container) -> None:
    async with photo_context(engine, "thumbnail-test", "test-original.jpg") as ctx:
        result = await create_thumbnails_batch_task_impl([{"photo_id": str(ctx.photo_id), "object_key": ctx.object_key}])

        assert_batch_counts(result, successful=1)

        async with session_scope(engine) as session:
            updated_photo = await session.get(Photo, ctx.photo_id)
            assert updated_photo is not None
            assert updated_photo.thumbnail_object_key.endswith("test-original_thumbnail.avif")
            assert updated_photo.width is not None and updated_photo.height is not None

            s3_client = get_s3_client()
            bucket = S3Settings().bucket
            response = s3_client.head_object(Bucket=bucket, Key=updated_photo.thumbnail_object_key)
            assert response["ContentLength"] > 0


@pytest.mark.asyncio
async def test_create_thumbnails_batch_task_skips_missing_object(engine: AsyncEngine, s3_container) -> None:
    async with photo_context(engine, "missing-test", "missing.jpg") as ctx:
        s3_client = get_s3_client()
        bucket = S3Settings().bucket
        s3_client.delete_object(Bucket=bucket, Key=ctx.object_key)

        result = await create_thumbnails_batch_task_impl([{"photo_id": str(ctx.photo_id), "object_key": ctx.object_key}])

        assert_batch_counts(result, failed=1)
        assert any(r["message"] == "File not found in S3" for r in result["results"])


@pytest.mark.asyncio
async def test_create_thumbnails_batch_task_skips_deleted_during_processing(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    async with photo_context(engine, "deleted-during", "deleted.jpg") as ctx:
        original_precheck = photo_tasks._get_existing_photo_ids

        async def _delete_after_precheck(photo_ids: list[str]) -> set[str]:
            ids = await original_precheck(photo_ids)
            async with session_scope(engine) as session:
                await session.execute(delete(Photo).where(Photo.id == ctx.photo_id))
            return ids

        monkeypatch.setattr(photo_tasks, "_get_existing_photo_ids", _delete_after_precheck)

        result = await create_thumbnails_batch_task_impl([{"photo_id": str(ctx.photo_id), "object_key": ctx.object_key}])
        assert_batch_counts(result, skipped=1)
        assert any(r["message"] == "Photo deleted during processing" for r in result["results"])


@pytest.mark.asyncio
async def test_create_thumbnails_batch_task_reports_processing_errors(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    async with photo_context(engine, "error-test", "broken.jpg", content=b"not-an-image") as ctx:
        monkeypatch.setattr(photo_tasks, "_is_valid_image", lambda _: True)  # Force validation to pass so processing continues to error
        result = await create_thumbnails_batch_task_impl([{"photo_id": str(ctx.photo_id), "object_key": ctx.object_key}])
        assert_batch_counts(result, failed=1)
        assert any(r["status"] == "error" for r in result["results"])

        async with session_scope(engine) as session:
            updated_photo = await session.get(Photo, ctx.photo_id)
            assert updated_photo.thumbnail_object_key == ctx.object_key


@pytest.mark.asyncio
async def test_create_thumbnails_batch_task_invalid_image_deletes_record_when_mocked(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Ensure that when `_is_valid_image` returns False we delete the DB record and S3 object.

    This test mocks `_is_valid_image` to isolate the decision path.
    """
    async with photo_context(engine, "mocked-invalid", "mocked.jpg") as ctx:
        # Force the validator to return False
        monkeypatch.setattr(photo_tasks, "_is_valid_image", lambda _: False)

        result = await create_thumbnails_batch_task_impl([{"photo_id": str(ctx.photo_id), "object_key": ctx.object_key}])

        assert_batch_counts(result, failed=1)

        async with session_scope(engine) as session:
            assert await session.get(Photo, ctx.photo_id) is None

        s3_client = get_s3_client()
        bucket = S3Settings().bucket
        with pytest.raises(ClientError):
            s3_client.head_object(Bucket=bucket, Key=ctx.object_key)


@pytest.mark.asyncio
async def test_batch_update_photo_metadata_failure(monkeypatch):
    tracker = BatchTaskResult(1)
    successful = [{"photo_id": str(uuid4()), "thumbnail_object_key": "foo", "width": 10, "height": 20, "status": "success"}]
    tracker.successful = len(successful)

    @asynccontextmanager
    async def _failing_session():
        class DummySession:
            async def execute(self, *args, **kwargs):
                raise RuntimeError("db down")

        yield DummySession()

    monkeypatch.setattr("viewport.task_utils.task_db_session", _failing_session)

    await _batch_update_photo_results(successful, tracker)

    assert tracker.failed == 1
    assert tracker.successful == 0
    assert successful[0]["status"] == "error"


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_no_matching_photos(engine: AsyncEngine) -> None:
    """Test that reconcile_successful_uploads_task returns empty result when no photos match criteria."""
    result = await reconcile_successful_uploads_task_impl()

    assert result["requeued_count"] == 0


@pytest.mark.asyncio
async def test_reconcile_storage_quotas_recomputes_from_active_successful_and_pending(engine: AsyncEngine) -> None:
    async with session_scope(engine) as session:
        user = User(email=f"reconcile-{uuid4()}@example.com", password_hash="hashed", display_name="reconcile", storage_used=999, storage_reserved=999)
        session.add(user)
        await session.flush()

        active_gallery = Gallery(owner_id=user.id, name="active")
        deleted_gallery = Gallery(owner_id=user.id, name="deleted", is_deleted=True)
        session.add(active_gallery)
        session.add(deleted_gallery)
        await session.flush()

        session.add_all(
            [
                Photo(
                    gallery_id=active_gallery.id,
                    object_key=f"{active_gallery.id}/succ.jpg",
                    thumbnail_object_key=f"{active_gallery.id}/succ-thumb.jpg",
                    file_size=120,
                    status=PhotoUploadStatus.SUCCESSFUL,
                ),
                Photo(
                    gallery_id=active_gallery.id,
                    object_key=f"{active_gallery.id}/pending.jpg",
                    thumbnail_object_key=f"{active_gallery.id}/pending.jpg",
                    file_size=80,
                    status=PhotoUploadStatus.PENDING,
                ),
                Photo(
                    gallery_id=active_gallery.id,
                    object_key=f"{active_gallery.id}/failed.jpg",
                    thumbnail_object_key=f"{active_gallery.id}/failed.jpg",
                    file_size=999,
                    status=PhotoUploadStatus.FAILED,
                ),
                Photo(
                    gallery_id=deleted_gallery.id,
                    object_key=f"{deleted_gallery.id}/deleted-succ.jpg",
                    thumbnail_object_key=f"{deleted_gallery.id}/deleted-succ-thumb.jpg",
                    file_size=777,
                    status=PhotoUploadStatus.SUCCESSFUL,
                ),
            ]
        )
        await session.flush()
        user_id = user.id

    result = await reconcile_storage_quotas_task_impl()
    assert result["updated_users"] == 1

    async with session_scope(engine) as session:
        refreshed = await session.get(User, user_id)
        assert refreshed is not None
        assert refreshed.storage_used == 120
        assert refreshed.storage_reserved == 80


@pytest.mark.asyncio
async def test_reconcile_storage_quotas_includes_users_without_photos(engine: AsyncEngine) -> None:
    async with session_scope(engine) as session:
        user_with_photos = User(email=f"reconcile-owner-{uuid4()}@example.com", password_hash="hashed", display_name="owner", storage_used=0, storage_reserved=0)
        user_without_photos = User(email=f"reconcile-empty-{uuid4()}@example.com", password_hash="hashed", display_name="empty", storage_used=55, storage_reserved=44)
        session.add(user_with_photos)
        session.add(user_without_photos)
        await session.flush()

        gallery = Gallery(owner_id=user_with_photos.id, name="owner-gallery")
        session.add(gallery)
        await session.flush()

        session.add(
            Photo(
                gallery_id=gallery.id,
                object_key=f"{gallery.id}/succ.jpg",
                thumbnail_object_key=f"{gallery.id}/succ-thumb.jpg",
                file_size=10,
                status=PhotoUploadStatus.SUCCESSFUL,
            )
        )
        await session.flush()

        owner_id = user_with_photos.id
        empty_id = user_without_photos.id

    result = await reconcile_storage_quotas_task_impl()
    assert result["updated_users"] == 2

    async with session_scope(engine) as session:
        owner = await session.get(User, owner_id)
        empty = await session.get(User, empty_id)
        assert owner is not None
        assert empty is not None
        assert owner.storage_used == 10
        assert owner.storage_reserved == 0
        assert empty.storage_used == 0
        assert empty.storage_reserved == 0


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_selects_correct_photos(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task selects only SUCCESSFUL photos older than threshold with missing metadata."""

    async with (
        photo_context(engine, "reconcile-test", "photo1.jpg") as ctx1,
        photo_context(engine, "reconcile-test", "photo2.jpg") as ctx2,
        photo_context(engine, "reconcile-test", "photo3.jpg") as ctx3,
    ):
        async with session_scope(engine) as session:
            # Photo 1: SUCCESSFUL, old, missing width (should match)
            photo1 = await session.get(Photo, ctx1.photo_id)
            photo1.status = 2  # SUCCESSFUL
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            await session.flush()

            # Photo 2: SUCCESSFUL, old, but has all metadata (should NOT match)
            photo2 = await session.get(Photo, ctx2.photo_id)
            photo2.status = 2  # SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = 480
            photo2.thumbnail_object_key = "different-thumbnail-key"
            await session.flush()

            # Photo 3: SUCCESSFUL, but recent (within threshold, should NOT match)
            photo3 = await session.get(Photo, ctx3.photo_id)
            photo3.status = 2  # SUCCESSFUL
            photo3.uploaded_at = datetime.now(UTC) - timedelta(minutes=1)
            photo3.width = None
            await session.flush()

        # Mock Taskiq enqueue to capture the call without actually queuing
        captured_calls = []

        async def mock_kiq(photos):
            captured_calls.append(photos)
            return None

        monkeypatch.setattr("viewport.tasks.maintenance_tasks.create_thumbnails_batch_task.kiq", mock_kiq)

        result = await reconcile_successful_uploads_task_impl()

        # Only photo1 should match
        assert result["requeued_count"] == 1
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert len(photos_payload) == 1
        assert photos_payload[0]["photo_id"] == str(ctx1.photo_id)
        assert photos_payload[0]["object_key"] == ctx1.object_key


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_filters_deleted_galleries(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task excludes photos from soft-deleted galleries."""

    async with photo_context(engine, "active-gallery", "photo1.jpg") as ctx1, photo_context(engine, "deleted-gallery", "photo2.jpg") as ctx2:
        async with session_scope(engine) as session:
            # Photo 1: SUCCESSFUL, old, missing metadata, from active gallery (should match)
            photo1 = await session.get(Photo, ctx1.photo_id)
            photo1.status = 2  # SUCCESSFUL
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            await session.flush()

            # Photo 2: SUCCESSFUL, old, missing metadata, from deleted gallery (should NOT match)
            photo2 = await session.get(Photo, ctx2.photo_id)
            photo2.status = 2  # SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = None
            gallery = await session.get(Gallery, ctx2.gallery_id)
            gallery.is_deleted = True
            await session.flush()

        captured_calls = []

        async def mock_kiq(photos):
            captured_calls.append(photos)
            return None

        monkeypatch.setattr("viewport.tasks.maintenance_tasks.create_thumbnails_batch_task.kiq", mock_kiq)

        result = await reconcile_successful_uploads_task_impl()

        # Only photo1 from active gallery should be requeued
        assert result["requeued_count"] == 1
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert photos_payload[0]["photo_id"] == str(ctx1.photo_id)


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_max_batch_limit(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task respects the max_batch limit."""

    # Create a single gallery with 505 photos (more than max_batch of 500)
    gallery_id = None
    user_id = None
    try:
        async with session_scope(engine) as session:
            user = User(email=f"batch-limit-{uuid4()}@example.com", password_hash="hashed", display_name="batch")
            session.add(user)
            await session.flush()
            user_id = user.id

            gallery = Gallery(owner_id=user.id, name="batch-limit-gallery")
            session.add(gallery)
            await session.flush()
            gallery_id = gallery.id

            content = _create_dummy_jpeg_bytes()

            # Create 505 photos efficiently in a single session
            for i in range(505):
                object_key = f"{gallery.id}/photo{i}.jpg"
                upload_fileobj(content, object_key, content_type="image/jpeg")

                photo = Photo(
                    gallery_id=gallery.id,
                    object_key=object_key,
                    thumbnail_object_key=object_key,
                    file_size=len(content),
                    status=2,  # SUCCESSFUL
                    uploaded_at=datetime.now(UTC) - timedelta(minutes=10),
                    width=None,  # Missing metadata
                    height=480,
                )
                session.add(photo)

            await session.flush()

        captured_calls = []

        async def mock_kiq(photos_batch):
            captured_calls.append(photos_batch)
            return None

        monkeypatch.setattr("viewport.tasks.maintenance_tasks.create_thumbnails_batch_task.kiq", mock_kiq)

        result = await reconcile_successful_uploads_task_impl()

        # Should only requeue up to 500 photos (the max_batch limit)
        assert result["requeued_count"] == 500
        assert len(captured_calls) == 1
        assert len(captured_calls[0]) == 500
    finally:
        # Clean up test data
        if gallery_id:
            async with session_scope(engine) as session:
                await session.execute(delete(Photo).where(Photo.gallery_id == gallery_id))
                await session.execute(delete(Gallery).where(Gallery.id == gallery_id))
        if user_id:
            async with session_scope(engine) as session:
                await session.execute(delete(User).where(User.id == user_id))


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_missing_metadata_criteria(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test all missing metadata conditions that trigger requeue."""

    async with (
        photo_context(engine, "metadata-test", "missing-width.jpg") as ctx1,
        photo_context(engine, "metadata-test", "missing-height.jpg") as ctx2,
        photo_context(engine, "metadata-test", "thumbnail-equals-original.jpg") as ctx3,
    ):
        async with session_scope(engine) as session:
            # Photo 1: missing width
            photo1 = await session.get(Photo, ctx1.photo_id)
            photo1.status = 2
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            photo1.thumbnail_object_key = "different-key"
            await session.flush()

            # Photo 2: missing height
            photo2 = await session.get(Photo, ctx2.photo_id)
            photo2.status = 2
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = None
            photo2.thumbnail_object_key = "different-key"
            await session.flush()

            # Photo 3: thumbnail equals original (not yet processed)
            photo3 = await session.get(Photo, ctx3.photo_id)
            photo3.status = 2
            photo3.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo3.width = 640
            photo3.height = 480
            photo3.thumbnail_object_key = photo3.object_key  # Same as original
            await session.flush()

        captured_calls = []

        async def mock_kiq(photos_batch):
            captured_calls.append(photos_batch)
            return None

        monkeypatch.setattr("viewport.tasks.maintenance_tasks.create_thumbnails_batch_task.kiq", mock_kiq)

        result = await reconcile_successful_uploads_task_impl()

        # All three should match
        assert result["requeued_count"] == 3
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert len(photos_payload) == 3
        photo_ids = {p["photo_id"] for p in photos_payload}
        assert photo_ids == {str(ctx1.photo_id), str(ctx2.photo_id), str(ctx3.photo_id)}


@pytest.mark.asyncio
async def test_reconcile_successful_uploads_requeue_then_process_keeps_successful_status(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Integration path: SUCCESSFUL without thumbnail metadata is requeued and then processed successfully."""

    async with photo_context(engine, "requeue-then-process", "eventual.jpg") as ctx:
        async with session_scope(engine) as session:
            photo = await session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.SUCCESSFUL
            photo.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo.width = None
            photo.height = None
            photo.thumbnail_object_key = photo.object_key

            user = await session.get(User, ctx.user_id)
            assert user is not None
            user.storage_used = photo.file_size
            user.storage_reserved = 0
            await session.flush()

        captured_calls: list[list[dict[str, str]]] = []

        async def mock_kiq(photos_batch):
            captured_calls.append(photos_batch)

        monkeypatch.setattr("viewport.tasks.maintenance_tasks.create_thumbnails_batch_task.kiq", mock_kiq)

        requeue_result = await reconcile_successful_uploads_task_impl()

        assert requeue_result["requeued_count"] == 1
        assert len(captured_calls) == 1
        assert captured_calls[0][0]["photo_id"] == str(ctx.photo_id)
        assert captured_calls[0][0]["object_key"] == ctx.object_key

        process_result = await create_thumbnails_batch_task_impl(captured_calls[0])
        assert_batch_counts(process_result, successful=1)

        async with session_scope(engine) as session:
            updated_photo = await session.get(Photo, ctx.photo_id)
            assert updated_photo is not None
            assert updated_photo.status == PhotoUploadStatus.SUCCESSFUL
            assert updated_photo.thumbnail_object_key.endswith("eventual_thumbnail.avif")
            assert updated_photo.width is not None
            assert updated_photo.height is not None

            updated_user = await session.get(User, ctx.user_id)
            assert updated_user is not None
            assert updated_user.storage_reserved == 0
            assert updated_user.storage_used == updated_photo.file_size


@pytest.mark.asyncio
async def test_delete_gallery_data_task_deletes_gallery_and_objects(engine: AsyncEngine, s3_container) -> None:
    """Test that delete_gallery_data_task deletes all S3 objects and DB records."""

    # Create a gallery with 2 photos manually to avoid photo_context cleanup
    async with session_scope(engine) as session:
        user = User(email=f"delete-test-{uuid4()}@example.com", password_hash="hashed", display_name="delete")
        session.add(user)
        await session.flush()

        gallery = Gallery(owner_id=user.id, name="gallery-to-delete")
        session.add(gallery)
        await session.flush()

        # Create photo 1 with a thumbnail
        content1 = _create_dummy_jpeg_bytes()
        object_key1 = f"{gallery.id}/photo1.jpg"
        thumbnail_key1 = f"{gallery.id}/thumbnails/photo1.avif"
        upload_fileobj(content1, object_key1, content_type="image/jpeg")
        upload_fileobj(content1, thumbnail_key1, content_type="image/avif")

        photo1 = Photo(
            gallery_id=gallery.id,
            object_key=object_key1,
            thumbnail_object_key=thumbnail_key1,
            file_size=len(content1),
        )
        session.add(photo1)
        await session.flush()

        # Create photo 2
        content2 = _create_dummy_jpeg_bytes()
        object_key2 = f"{gallery.id}/photo2.jpg"
        upload_fileobj(content2, object_key2, content_type="image/jpeg")

        photo2 = Photo(
            gallery_id=gallery.id,
            object_key=object_key2,
            thumbnail_object_key=object_key2,
            file_size=len(content2),
        )
        session.add(photo2)
        await session.flush()

        gallery_id_str = str(gallery.id)

    # Verify S3 objects exist
    s3_client = get_s3_client()
    bucket = S3Settings().bucket
    s3_client.head_object(Bucket=bucket, Key=object_key1)
    s3_client.head_object(Bucket=bucket, Key=thumbnail_key1)
    s3_client.head_object(Bucket=bucket, Key=object_key2)

    # Run delete task
    result = await delete_gallery_data_task_impl(gallery_id_str)

    # Verify result - should have deleted 3 objects (photo1, photo1 thumbnail, photo2)
    assert result["deleted_objects"] == 3

    # Verify S3 objects are deleted
    with pytest.raises(ClientError):
        s3_client.head_object(Bucket=bucket, Key=object_key1)
    with pytest.raises(ClientError):
        s3_client.head_object(Bucket=bucket, Key=thumbnail_key1)
    with pytest.raises(ClientError):
        s3_client.head_object(Bucket=bucket, Key=object_key2)

    # Verify DB records are deleted
    async with session_scope(engine) as session:
        photo_count = await session.scalar(select(func.count()).select_from(Photo).where(Photo.gallery_id == uuid.UUID(gallery_id_str)))
        assert photo_count == 0
        assert await session.get(Gallery, uuid.UUID(gallery_id_str)) is None


@pytest.mark.asyncio
async def test_delete_gallery_data_task_handles_empty_gallery(engine: AsyncEngine, s3_container) -> None:
    """Test that delete_gallery_data_task handles gallery with no objects."""

    async with session_scope(engine) as session:
        user = User(email=f"empty-gallery-{uuid4()}@example.com", password_hash="hashed", display_name="empty")
        session.add(user)
        await session.flush()

        gallery = Gallery(owner_id=user.id, name="empty-gallery")
        session.add(gallery)
        await session.flush()

        gallery_id_str = str(gallery.id)
        user_id = user.id

    # Run delete task on empty gallery
    result = await delete_gallery_data_task_impl(gallery_id_str)

    assert result["deleted_objects"] == 0

    # Verify gallery is deleted from DB
    async with session_scope(engine) as session:
        assert await session.get(Gallery, uuid.UUID(gallery_id_str)) is None
        assert await session.get(User, user_id) is not None  # User should still exist


@pytest.mark.asyncio
async def test_delete_gallery_data_task_handles_pagination(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task handles S3 pagination correctly."""

    async with photo_context(engine, "paginated-gallery", "photo1.jpg") as ctx:
        gallery_id_str = str(ctx.gallery_id)

        call_count = 0

        async def mock_list_object_keys(prefix: str):
            nonlocal call_count
            call_count += 1
            assert prefix == f"{gallery_id_str}/"

            # First call: return some objects with IsTruncated=True
            if call_count == 1:
                return [f"{gallery_id_str}/photo1.jpg", f"{gallery_id_str}/photo2.jpg"]
            # Second call: return remaining objects with IsTruncated=False
            else:
                return []

        async def mock_delete_objects(keys: list[str]) -> int:
            return len(keys)

        class DummyAsyncS3:
            list_object_keys = staticmethod(mock_list_object_keys)
            delete_objects = staticmethod(mock_delete_objects)

        # Run delete task
        result = await delete_gallery_data_task_impl(gallery_id_str, s3_client=DummyAsyncS3())

        # Verify both pages were processed
        assert call_count == 1
        assert result["deleted_objects"] == 2


@pytest.mark.asyncio
async def test_delete_gallery_data_task_deletes_sharelinks(engine: AsyncEngine, s3_container) -> None:
    """Test that delete_gallery_data_task deletes associated ShareLink records."""
    async with photo_context(engine, "sharelink-gallery", "photo.jpg") as ctx:
        async with session_scope(engine) as session:
            gallery = await session.get(Gallery, ctx.gallery_id)
            sharelink = ShareLink(gallery_id=gallery.id)
            session.add(sharelink)
            await session.flush()
            sharelink_id = sharelink.id

        gallery_id_str = str(ctx.gallery_id)

        # Run delete task

        await delete_gallery_data_task_impl(gallery_id_str)

        # Verify ShareLink is deleted
        async with session_scope(engine) as session:
            assert await session.get(ShareLink, sharelink_id) is None


@pytest.mark.asyncio
async def test_delete_gallery_data_task_batches_deletions(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task batches S3 deletions in chunks of 1000."""

    async with session_scope(engine) as session:
        user = User(email=f"batch-test-{uuid4()}@example.com", password_hash="hashed", display_name="batch")
        session.add(user)
        await session.flush()

        gallery = Gallery(owner_id=user.id, name="batch-gallery")
        session.add(gallery)
        await session.flush()

        gallery_id_str = str(gallery.id)

    delete_calls = []

    async def mock_list_object_keys(prefix: str) -> list[str]:
        assert prefix == f"{gallery_id_str}/"
        return [f"{gallery_id_str}/file-{i}.jpg" for i in range(1500)]

    async def mock_delete_objects(keys: list[str]) -> int:
        for i in range(0, len(keys), 1000):
            batch = keys[i : i + 1000]
            delete_calls.append(batch)
        return len(keys)

    class DummyAsyncS3:
        list_object_keys = staticmethod(mock_list_object_keys)
        delete_objects = staticmethod(mock_delete_objects)

    # Run delete task
    result = await delete_gallery_data_task_impl(gallery_id_str, s3_client=DummyAsyncS3())

    # Verify batching
    assert len(delete_calls) == 2  # 1500 objects / 1000 per batch = 2 calls
    assert len(delete_calls[0]) == 1000
    assert len(delete_calls[1]) == 500
    assert result["deleted_objects"] == 1500


@pytest.mark.asyncio
async def test_delete_gallery_data_task_exception_retry(engine: AsyncEngine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task raises exception for retry on S3 error."""

    async with photo_context(engine, "error-gallery", "photo.jpg") as ctx:
        gallery_id_str = str(ctx.gallery_id)

        async def mock_list_object_keys(prefix: str):
            raise Exception("S3 service unavailable")

        class DummyAsyncS3:
            list_object_keys = staticmethod(mock_list_object_keys)

            @staticmethod
            async def delete_objects(keys: list[str]) -> int:
                return len(keys)

        # Task should raise exception
        with pytest.raises(Exception, match="S3 service unavailable"):
            await delete_gallery_data_task_impl(gallery_id_str, s3_client=DummyAsyncS3())
