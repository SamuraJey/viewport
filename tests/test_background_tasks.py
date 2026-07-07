import io
import uuid
from collections.abc import Callable, Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError, ConnectionClosedError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError, SSLError
from PIL import Image
from sqlalchemy import delete
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.orm import Session, sessionmaker

from viewport import background_tasks
from viewport.background_tasks import (
    ThumbnailTransientError,
    _delete_photo_data_impl,
    _is_retryable_s3_error,
    _is_valid_image,
    _process_single_photo,
    cleanup_orphaned_uploads_task,
    create_thumbnails_batch_task,
    delete_gallery_data_task,
    delete_photo_data_task,
    delete_photos_batch_task,
    notify_selection_submitted_task,
    reconcile_storage_quotas_task,
    reconcile_successful_uploads_task,
)
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.s3_utils import S3Settings, get_s3_client, get_s3_settings, upload_fileobj
from viewport.task_utils import BatchTaskResult

pytestmark = pytest.mark.requires_s3

IMAGE_SIZE = (640, 480)


@pytest.fixture
def engine(sync_engine: Engine) -> Engine:
    return sync_engine


class PhotoSetup(NamedTuple):
    photo_id: str
    gallery_id: str
    user_id: str
    object_key: str


@contextmanager
def session_scope(engine: Engine | AsyncEngine) -> Generator[Session]:
    bind = engine.sync_engine if isinstance(engine, AsyncEngine) else engine
    session_local = sessionmaker(bind=bind)
    session = session_local()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _create_dummy_jpeg_bytes(width: int = IMAGE_SIZE[0], height: int = IMAGE_SIZE[1]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "orange").save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    return buffer.read()


@contextmanager
def photo_context(engine: Engine, gallery_name: str, filename: str, content: bytes | None = None):
    if content is None:
        content = _create_dummy_jpeg_bytes()

    with session_scope(engine) as session:
        user = User(email=f"celery-{uuid4()}@example.com", password_hash="hashed", display_name="celery")
        session.add(user)
        session.flush()

        gallery = Gallery(owner_id=user.id, name=gallery_name)
        session.add(gallery)
        session.flush()

        object_key = f"{gallery.id}/{filename}"
        upload_fileobj(content, object_key, content_type="image/jpeg")

        photo = Photo(
            gallery_id=gallery.id,
            object_key=object_key,
            thumbnail_object_key=object_key,
            file_size=len(content),
        )
        session.add(photo)
        session.flush()

        ctx = PhotoSetup(photo.id, gallery.id, user.id, object_key)

    try:
        yield ctx
    finally:
        with session_scope(engine) as session:
            session.query(Photo).filter(Photo.id == ctx.photo_id).delete()
            session.query(Gallery).filter(Gallery.id == ctx.gallery_id).delete()
            session.query(User).filter(User.id == ctx.user_id).delete()


def _execute_thumbnail_task(photo_id: str, object_key: str):
    """Import the Celery task lazily so fixtures can configure the environment first."""
    from viewport.background_tasks import create_thumbnails_batch_task

    return create_thumbnails_batch_task.run([{"photo_id": photo_id, "object_key": object_key}])


def assert_batch_counts(result, successful=0, failed=0, skipped=0):
    assert result["successful"] == successful
    assert result["failed"] == failed
    assert result["skipped"] == skipped


def test_create_thumbnails_batch_task_creates_thumbnail(engine: Engine, s3_container) -> None:
    with photo_context(engine, "celery-test", "celery-original.jpg") as ctx:
        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)

        assert_batch_counts(result, successful=1)

        with session_scope(engine) as session:
            updated_photo = session.get(Photo, ctx.photo_id)
            assert updated_photo is not None
            assert updated_photo.thumbnail_object_key.endswith("celery-original_thumbnail.avif")
            assert updated_photo.width is not None and updated_photo.height is not None

            s3_client = get_s3_client()
            bucket = S3Settings().bucket
            response = s3_client.head_object(Bucket=bucket, Key=updated_photo.thumbnail_object_key)
            assert response["ContentLength"] > 0


def test_create_thumbnails_batch_task_skips_missing_object(engine: Engine, s3_container) -> None:
    with photo_context(engine, "missing-test", "missing.jpg") as ctx:
        s3_client = get_s3_client()
        bucket = S3Settings().bucket
        s3_client.delete_object(Bucket=bucket, Key=ctx.object_key)

        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)

        assert_batch_counts(result, failed=1)
        assert any(r["message"] == "File not found in S3" for r in result["results"])


def test_create_thumbnails_batch_task_skips_deleted_during_processing(engine: Engine, s3_container, monkeypatch) -> None:
    with photo_context(engine, "deleted-during", "deleted.jpg") as ctx:
        original_precheck: Callable[[list[str]], set[str]] = background_tasks._get_existing_photo_ids

        def _delete_after_precheck(photo_ids: list[str]) -> set[str]:
            existing_ids: set[str] = original_precheck(photo_ids)
            with session_scope(engine) as session:
                session.query(Photo).filter(Photo.id == ctx.photo_id).delete()
            return existing_ids

        monkeypatch.setattr(background_tasks, "_get_existing_photo_ids", _delete_after_precheck)

        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)
        assert_batch_counts(result, skipped=1)
        assert any(r["message"] == "Photo deleted during processing" for r in result["results"])


def test_create_thumbnails_batch_task_reports_processing_errors(engine: Engine, s3_container, monkeypatch) -> None:
    with photo_context(engine, "error-test", "broken.jpg", content=b"not-an-image") as ctx:
        monkeypatch.setattr(background_tasks, "_is_valid_image", lambda _: True)  # Force validation to pass so processing continues to error
        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)
        assert_batch_counts(result, failed=1)
        assert any(r["status"] == "error" for r in result["results"])

        with session_scope(engine) as session:
            updated_photo = session.get(Photo, ctx.photo_id)
            assert updated_photo is not None
            assert updated_photo.thumbnail_object_key == ctx.object_key


def test_create_thumbnails_batch_task_invalid_image_deletes_record_when_mocked(engine: Engine, s3_container, monkeypatch) -> None:
    """Ensure that when `_is_valid_image` returns False we delete the DB record and S3 object.

    This test mocks `_is_valid_image` to isolate the decision path.
    """
    with photo_context(engine, "mocked-invalid", "mocked.jpg") as ctx:
        # Force the validator to return False
        monkeypatch.setattr(background_tasks, "_is_valid_image", lambda _: False)

        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)

        assert_batch_counts(result, failed=1)

        with session_scope(engine) as session:
            assert session.get(Photo, ctx.photo_id) is None

        s3_client = get_s3_client()
        bucket = S3Settings().bucket
        with pytest.raises(ClientError):
            s3_client.head_object(Bucket=bucket, Key=ctx.object_key)


def test_batch_update_photo_metadata_failure(monkeypatch):
    tracker = BatchTaskResult(1)
    successful = [{"photo_id": str(uuid4()), "thumbnail_object_key": "foo", "width": 10, "height": 20, "status": "success"}]

    @contextmanager
    def _failing_session():
        class DummySession:
            def execute(self, *args, **kwargs):
                raise RuntimeError("db down")

        yield DummySession()

    monkeypatch.setattr(background_tasks, "task_db_session", _failing_session)

    with pytest.raises(background_tasks.ThumbnailTransientError, match="Failed to update photo results"):
        background_tasks._batch_update_photo_results(successful, tracker)

    assert tracker.successful == 0
    assert tracker.failed == 0
    assert successful[0]["status"] == "success"


def test_reconcile_successful_uploads_no_matching_photos(engine: Engine) -> None:
    """Test that reconcile_successful_uploads_task returns empty result when no photos match criteria."""
    from viewport.background_tasks import reconcile_successful_uploads_task

    result = reconcile_successful_uploads_task.run()

    assert result["requeued_count"] == 0


def test_reconcile_storage_quotas_recomputes_from_active_successful_and_pending(engine: Engine) -> None:
    with session_scope(engine) as session:
        user = User(email=f"reconcile-{uuid4()}@example.com", password_hash="hashed", display_name="reconcile", storage_used=999, storage_reserved=999)
        session.add(user)
        session.flush()

        active_gallery = Gallery(owner_id=user.id, name="active")
        deleted_gallery = Gallery(owner_id=user.id, name="deleted", is_deleted=True)
        session.add(active_gallery)
        session.add(deleted_gallery)
        session.flush()

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
                    object_key=f"{active_gallery.id}/creating.jpg",
                    thumbnail_object_key=f"{active_gallery.id}/creating.jpg",
                    file_size=60,
                    status=PhotoUploadStatus.THUMBNAIL_CREATING,
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
        session.flush()
        user_id = user.id

    result = reconcile_storage_quotas_task.run()
    assert result["updated_users"] == 1

    with session_scope(engine) as session:
        refreshed = session.get(User, user_id)
        assert refreshed is not None
        assert refreshed.storage_used == 180
        assert refreshed.storage_reserved == 80


def test_reconcile_storage_quotas_includes_users_without_photos(engine: Engine) -> None:
    with session_scope(engine) as session:
        user_with_photos = User(email=f"reconcile-owner-{uuid4()}@example.com", password_hash="hashed", display_name="owner", storage_used=0, storage_reserved=0)
        user_without_photos = User(email=f"reconcile-empty-{uuid4()}@example.com", password_hash="hashed", display_name="empty", storage_used=55, storage_reserved=44)
        session.add(user_with_photos)
        session.add(user_without_photos)
        session.flush()

        gallery = Gallery(owner_id=user_with_photos.id, name="owner-gallery")
        session.add(gallery)
        session.flush()

        session.add(
            Photo(
                gallery_id=gallery.id,
                object_key=f"{gallery.id}/succ.jpg",
                thumbnail_object_key=f"{gallery.id}/succ-thumb.jpg",
                file_size=10,
                status=PhotoUploadStatus.SUCCESSFUL,
            )
        )
        session.flush()

        owner_id = user_with_photos.id
        empty_id = user_without_photos.id

    result = reconcile_storage_quotas_task.run()
    assert result["updated_users"] == 2

    with session_scope(engine) as session:
        owner = session.get(User, owner_id)
        empty = session.get(User, empty_id)
        assert owner is not None
        assert empty is not None
        assert owner.storage_used == 10
        assert owner.storage_reserved == 0
        assert empty.storage_used == 0
        assert empty.storage_reserved == 0


def test_reconcile_successful_uploads_selects_correct_photos(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task selects processable photos older than threshold with missing metadata."""
    with photo_context(engine, "reconcile-test", "photo1.jpg") as ctx1, photo_context(engine, "reconcile-test", "photo2.jpg") as ctx2, photo_context(engine, "reconcile-test", "photo3.jpg") as ctx3:
        with session_scope(engine) as session:
            # Photo 1: THUMBNAIL_CREATING, old, missing width (should match)
            photo1 = session.get(Photo, ctx1.photo_id)
            assert photo1 is not None
            photo1.status = PhotoUploadStatus.THUMBNAIL_CREATING
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            session.flush()

            # Photo 2: SUCCESSFUL, old, but has all metadata (should NOT match)
            photo2 = session.get(Photo, ctx2.photo_id)
            assert photo2 is not None
            photo2.status = PhotoUploadStatus.SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = 480
            photo2.thumbnail_object_key = "different-thumbnail-key"
            session.flush()

            # Photo 3: SUCCESSFUL, but recent (within threshold, should NOT match)
            photo3 = session.get(Photo, ctx3.photo_id)
            assert photo3 is not None
            photo3.status = PhotoUploadStatus.SUCCESSFUL
            photo3.uploaded_at = datetime.now(UTC) - timedelta(minutes=1)
            photo3.width = None
            session.flush()

        # Mock delay to capture the call without actually queuing
        captured_calls = []

        original_delay = create_thumbnails_batch_task.delay

        def mock_delay(photos):
            captured_calls.append(photos)
            return original_delay(photos)

        monkeypatch.setattr(create_thumbnails_batch_task, "delay", mock_delay)

        result = reconcile_successful_uploads_task.run()

        # Only photo1 should match
        assert result["requeued_count"] == 1
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert len(photos_payload) == 1
        assert photos_payload[0]["photo_id"] == str(ctx1.photo_id)
        assert photos_payload[0]["object_key"] == ctx1.object_key


def test_reconcile_successful_uploads_filters_deleted_galleries(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task excludes photos from soft-deleted galleries."""

    with photo_context(engine, "active-gallery", "photo1.jpg") as ctx1, photo_context(engine, "deleted-gallery", "photo2.jpg") as ctx2:
        with session_scope(engine) as session:
            # Photo 1: SUCCESSFUL, old, missing metadata, from active gallery (should match)
            photo1 = session.get(Photo, ctx1.photo_id)
            assert photo1 is not None
            photo1.status = 2  # SUCCESSFUL
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            session.flush()

            # Photo 2: SUCCESSFUL, old, missing metadata, from deleted gallery (should NOT match)
            photo2 = session.get(Photo, ctx2.photo_id)
            assert photo2 is not None
            photo2.status = 2  # SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = None
            gallery = session.get(Gallery, ctx2.gallery_id)
            assert gallery is not None
            gallery.is_deleted = True
            session.flush()

        captured_calls = []

        original_delay = create_thumbnails_batch_task.delay

        def mock_delay(photos):
            captured_calls.append(photos)
            return original_delay(photos)

        monkeypatch.setattr(create_thumbnails_batch_task, "delay", mock_delay)

        result = reconcile_successful_uploads_task.run()

        # Only photo1 from active gallery should be requeued
        assert result["requeued_count"] == 1
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert photos_payload[0]["photo_id"] == str(ctx1.photo_id)


def test_reconcile_successful_uploads_max_batch_limit(engine: Engine, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task respects the max_batch limit."""

    # Create a single gallery with 501 photos (one more than max_batch of 500)
    gallery_id = None
    user_id = None
    try:
        with session_scope(engine) as session:
            user = User(email=f"batch-limit-{uuid4()}@example.com", password_hash="hashed", display_name="batch")
            session.add(user)
            session.flush()
            user_id = user.id

            gallery = Gallery(owner_id=user.id, name="batch-limit-gallery")
            session.add(gallery)
            session.flush()
            gallery_id = gallery.id

            photo_rows = [
                Photo(
                    gallery_id=gallery.id,
                    object_key=f"{gallery.id}/photo{i}.jpg",
                    thumbnail_object_key=f"{gallery.id}/photo{i}.jpg",
                    file_size=10,
                    status=PhotoUploadStatus.SUCCESSFUL,
                    uploaded_at=datetime.now(UTC) - timedelta(minutes=10),
                    width=None,
                    height=480,
                )
                for i in range(501)
            ]
            session.add_all(photo_rows)
            session.flush()

        captured_calls = []

        def mock_delay(photos_batch):
            captured_calls.append(photos_batch)

        monkeypatch.setattr(create_thumbnails_batch_task, "delay", mock_delay)

        result = reconcile_successful_uploads_task.run()

        # Should only requeue up to 500 photos (the max_batch limit)
        assert result["requeued_count"] == 500
        assert len(captured_calls) == 1
        assert len(captured_calls[0]) == 500
    finally:
        # Clean up test data
        if gallery_id:
            with session_scope(engine) as session:
                session.execute(delete(Photo).where(Photo.gallery_id == gallery_id))
                session.execute(delete(Gallery).where(Gallery.id == gallery_id))
        if user_id:
            with session_scope(engine) as session:
                session.execute(delete(User).where(User.id == user_id))


def test_reconcile_successful_uploads_missing_metadata_criteria(engine: Engine, s3_container, monkeypatch) -> None:
    """Test all missing metadata conditions that trigger requeue."""

    with (
        photo_context(engine, "metadata-test", "missing-width.jpg") as ctx1,
        photo_context(engine, "metadata-test", "missing-height.jpg") as ctx2,
        photo_context(engine, "metadata-test", "thumbnail-equals-original.jpg") as ctx3,
    ):
        with session_scope(engine) as session:
            # Photo 1: missing width
            photo1 = session.get(Photo, ctx1.photo_id)
            assert photo1 is not None
            photo1.status = 2
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            photo1.thumbnail_object_key = "different-key"
            session.flush()

            # Photo 2: missing height
            photo2 = session.get(Photo, ctx2.photo_id)
            assert photo2 is not None
            photo2.status = 2
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = None
            photo2.thumbnail_object_key = "different-key"
            session.flush()

            # Photo 3: thumbnail equals original (not yet processed)
            photo3 = session.get(Photo, ctx3.photo_id)
            assert photo3 is not None
            photo3.status = 2
            photo3.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo3.width = 640
            photo3.height = 480
            photo3.thumbnail_object_key = photo3.object_key  # Same as original
            session.flush()

        captured_calls = []

        original_delay = create_thumbnails_batch_task.delay

        def mock_delay(photos_batch):
            captured_calls.append(photos_batch)
            return original_delay(photos_batch)

        monkeypatch.setattr(create_thumbnails_batch_task, "delay", mock_delay)

        result = reconcile_successful_uploads_task.run()

        # All three should match
        assert result["requeued_count"] == 3
        assert len(captured_calls) == 1
        photos_payload = captured_calls[0]
        assert len(photos_payload) == 3
        photo_ids = {p["photo_id"] for p in photos_payload}
        assert photo_ids == {str(ctx1.photo_id), str(ctx2.photo_id), str(ctx3.photo_id)}


def test_reconcile_successful_uploads_requeue_then_process_keeps_successful_status(engine: Engine, s3_container, monkeypatch) -> None:
    """Integration path: SUCCESSFUL without thumbnail metadata is requeued and then processed successfully."""

    with photo_context(engine, "requeue-then-process", "eventual.jpg") as ctx:
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.SUCCESSFUL
            photo.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo.width = None
            photo.height = None
            photo.thumbnail_object_key = photo.object_key

            user = session.get(User, ctx.user_id)
            assert user is not None
            user.storage_used = photo.file_size
            user.storage_reserved = 0
            session.flush()

        captured_calls: list[list[dict[str, str]]] = []

        def mock_delay(photos_batch):
            captured_calls.append(photos_batch)

        monkeypatch.setattr(create_thumbnails_batch_task, "delay", mock_delay)

        requeue_result = reconcile_successful_uploads_task.run()

        assert requeue_result["requeued_count"] == 1
        assert len(captured_calls) == 1
        assert captured_calls[0][0]["photo_id"] == str(ctx.photo_id)
        assert captured_calls[0][0]["object_key"] == ctx.object_key

        process_result = create_thumbnails_batch_task.run(captured_calls[0])
        assert_batch_counts(process_result, successful=1)

        with session_scope(engine) as session:
            updated_photo = session.get(Photo, ctx.photo_id)
            assert updated_photo is not None
            assert updated_photo.status == PhotoUploadStatus.SUCCESSFUL
            assert updated_photo.thumbnail_object_key.endswith("eventual_thumbnail.avif")
            assert updated_photo.width is not None
            assert updated_photo.height is not None

            updated_user = session.get(User, ctx.user_id)
            assert updated_user is not None
            assert updated_user.storage_reserved == 0
            assert updated_user.storage_used == updated_photo.file_size


def test_delete_gallery_data_task_deletes_gallery_and_objects(engine: Engine, s3_container) -> None:
    """Test that delete_gallery_data_task deletes all S3 objects and DB records."""

    # Create a gallery with 2 photos manually to avoid photo_context cleanup
    with session_scope(engine) as session:
        user = User(email=f"delete-test-{uuid4()}@example.com", password_hash="hashed", display_name="delete")
        session.add(user)
        session.flush()

        gallery = Gallery(owner_id=user.id, name="gallery-to-delete")
        session.add(gallery)
        session.flush()

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
        session.flush()

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
        session.flush()

        gallery_id_str = str(gallery.id)

    # Verify S3 objects exist
    s3_client = get_s3_client()
    bucket = S3Settings().bucket
    s3_client.head_object(Bucket=bucket, Key=object_key1)
    s3_client.head_object(Bucket=bucket, Key=thumbnail_key1)
    s3_client.head_object(Bucket=bucket, Key=object_key2)

    # Run delete task
    result = delete_gallery_data_task.run(gallery_id_str)

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
    with session_scope(engine) as session:
        assert session.query(Photo).filter(Photo.gallery_id == uuid.UUID(gallery_id_str)).count() == 0
        assert session.get(Gallery, uuid.UUID(gallery_id_str)) is None


def test_delete_gallery_data_task_handles_empty_gallery(engine: Engine, s3_container) -> None:
    """Test that delete_gallery_data_task handles gallery with no objects."""

    with session_scope(engine) as session:
        user = User(email=f"empty-gallery-{uuid4()}@example.com", password_hash="hashed", display_name="empty")
        session.add(user)
        session.flush()

        gallery = Gallery(owner_id=user.id, name="empty-gallery")
        session.add(gallery)
        session.flush()

        gallery_id_str = str(gallery.id)
        user_id = user.id

    # Run delete task on empty gallery
    result = delete_gallery_data_task.run(gallery_id_str)

    assert result["deleted_objects"] == 0

    # Verify gallery is deleted from DB
    with session_scope(engine) as session:
        assert session.get(Gallery, uuid.UUID(gallery_id_str)) is None
        assert session.get(User, user_id) is not None  # User should still exist


def test_delete_gallery_data_task_handles_pagination(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task handles S3 pagination correctly."""

    with photo_context(engine, "paginated-gallery", "photo1.jpg") as ctx:
        gallery_id_str = str(ctx.gallery_id)

        # Mock S3 list_objects_v2 to return paginated results
        s3_client = get_s3_client()
        _original_list = s3_client.list_objects_v2
        call_count = 0

        def mock_list_objects_v2(**kwargs):
            nonlocal call_count
            call_count += 1

            # First call: return some objects with IsTruncated=True
            if call_count == 1:
                return {
                    "Contents": [{"Key": f"{gallery_id_str}/photo1.jpg"}],
                    "IsTruncated": True,
                    "NextContinuationToken": "next-token",
                }
            # Second call: return remaining objects with IsTruncated=False
            else:
                return {
                    "Contents": [{"Key": f"{gallery_id_str}/photo2.jpg"}],
                    "IsTruncated": False,
                }

        monkeypatch.setattr(s3_client, "list_objects_v2", mock_list_objects_v2)

        # Run delete task
        result = delete_gallery_data_task.run(gallery_id_str)

        # Verify both pages were processed
        assert call_count == 2
        assert result["deleted_objects"] == 2


def test_delete_gallery_data_task_deletes_sharelinks(engine: Engine, s3_container) -> None:
    """Test that delete_gallery_data_task deletes associated ShareLink records."""
    with photo_context(engine, "sharelink-gallery", "photo.jpg") as ctx:
        with session_scope(engine) as session:
            gallery = session.get(Gallery, ctx.gallery_id)
            assert gallery is not None
            sharelink = ShareLink(gallery_id=gallery.id)
            session.add(sharelink)
            session.flush()
            sharelink_id = sharelink.id

        gallery_id_str = str(ctx.gallery_id)

        # Run delete task

        delete_gallery_data_task.run(gallery_id_str)

        # Verify ShareLink is deleted
        with session_scope(engine) as session:
            assert session.get(ShareLink, sharelink_id) is None


def test_delete_gallery_data_task_batches_deletions(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task batches S3 deletions in chunks of 1000."""

    with session_scope(engine) as session:
        user = User(email=f"batch-test-{uuid4()}@example.com", password_hash="hashed", display_name="batch")
        session.add(user)
        session.flush()

        gallery = Gallery(owner_id=user.id, name="batch-gallery")
        session.add(gallery)
        session.flush()

        gallery_id_str = str(gallery.id)

    # Mock S3 client to track delete calls
    s3_client = get_s3_client()
    delete_calls = []

    _original_delete = s3_client.delete_objects

    def mock_delete_objects(**kwargs):
        delete_calls.append(kwargs)
        # Don't actually delete (avoid modifying test state)
        return {"Deleted": kwargs.get("Delete", {}).get("Objects", [])}

    _original_list = s3_client.list_objects_v2

    def mock_list_objects_v2(**kwargs):
        # Return 1500 objects to test batching (should result in 2 delete calls)
        objects = [{"Key": f"{gallery_id_str}/file-{i}.jpg"} for i in range(1500)]
        return {"Contents": objects, "IsTruncated": False}

    monkeypatch.setattr(s3_client, "list_objects_v2", mock_list_objects_v2)
    monkeypatch.setattr(s3_client, "delete_objects", mock_delete_objects)

    # Run delete task
    result = delete_gallery_data_task.run(gallery_id_str)

    # Verify batching
    assert len(delete_calls) == 2  # 1500 objects / 1000 per batch = 2 calls
    assert len(delete_calls[0]["Delete"]["Objects"]) == 1000
    assert len(delete_calls[1]["Delete"]["Objects"]) == 500
    assert result["deleted_objects"] == 1500


def test_delete_gallery_data_task_exception_retry(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that delete_gallery_data_task raises exception for retry on S3 error."""

    with photo_context(engine, "error-gallery", "photo.jpg") as ctx:
        gallery_id_str = str(ctx.gallery_id)

        # Mock S3 to raise an error
        s3_client = get_s3_client()

        def mock_list_objects_v2(**kwargs):
            raise Exception("S3 service unavailable")

        monkeypatch.setattr(s3_client, "list_objects_v2", mock_list_objects_v2)

        # Task should raise exception (which triggers Celery retry)
        _task = delete_gallery_data_task
        with pytest.raises(Exception, match="S3 service unavailable"):
            # Call the underlying function directly to avoid Celery retry logic

            # Manually invoke the task function
            delete_gallery_data_task.run(gallery_id_str)


# ── _is_retryable_s3_error ──────────────────────────────────────────────


def test_is_retryable_s3_error_network_exceptions_are_retryable() -> None:
    """boto network exceptions are always retryable."""

    assert _is_retryable_s3_error(EndpointConnectionError(endpoint_url="https://s3.example.com")) is True
    assert _is_retryable_s3_error(ConnectionClosedError(endpoint_url="https://s3.example.com")) is True
    assert _is_retryable_s3_error(ConnectTimeoutError(endpoint_url="https://s3.example.com")) is True
    assert _is_retryable_s3_error(ReadTimeoutError(endpoint_url="https://s3.example.com")) is True
    assert _is_retryable_s3_error(SSLError(endpoint_url="https://s3.example.com", error=Exception("ssl"))) is True


def test_is_retryable_s3_error_non_client_error_not_retryable() -> None:
    """A plain Exception that is not a ClientError is not retryable."""

    assert _is_retryable_s3_error(RuntimeError("generic failure")) is False


def test_is_retryable_s3_error_access_denied_not_retryable() -> None:
    """403 AccessDenied is NOT retryable."""

    error = ClientError(
        {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 403}},
        "GetObject",
    )
    assert _is_retryable_s3_error(error) is False


def test_is_retryable_s3_error_internal_error_is_retryable() -> None:
    """InternalError code is retryable."""

    error = ClientError(
        {"Error": {"Code": "InternalError"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 500}},
        "GetObject",
    )
    assert _is_retryable_s3_error(error) is True


def test_is_retryable_s3_error_throttling_code_is_retryable() -> None:
    """429 status code is retryable regardless of error code."""

    error = ClientError(
        {"Error": {"Code": "SomeUnknownCode"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 429}},
        "PutObject",
    )
    assert _is_retryable_s3_error(error) is True


# ── _is_valid_image ──────────────────────────────────────────────────────


def test_is_valid_image_rejects_invalid_bytes() -> None:
    """Non-image bytes return False (UnidentifiedImageError branch)."""

    assert _is_valid_image(b"this is not an image file") is False


def test_is_valid_image_accepts_valid_jpeg() -> None:
    """A real JPEG returns True."""

    assert _is_valid_image(_create_dummy_jpeg_bytes()) is True


# ── _release_reserved_for_photos ─────────────────────────────────────────
def test_release_reserved_for_photos_decrements_storage(engine: Engine) -> None:
    """Calling _release_reserved_for_photos decrements storage_reserved for the owner."""
    from viewport.background_tasks import _release_reserved_for_photos

    user_id = None
    photo_id = None
    gallery_id = None

    with session_scope(engine) as session:
        user = User(email=f"reserved-{uuid4()}@example.com", password_hash="h", display_name="r", storage_reserved=5000)
        session.add(user)
        session.flush()
        user_id = user.id

        gallery = Gallery(owner_id=user.id, name="reserved-gallery")
        session.add(gallery)
        session.flush()
        gallery_id = gallery.id

        photo = Photo(gallery_id=gallery.id, object_key="k", thumbnail_object_key="k", file_size=3000, status=PhotoUploadStatus.PENDING)
        session.add(photo)
        session.flush()
        photo_id = photo.id

        _release_reserved_for_photos(session, [str(photo_id)])

    with session_scope(engine) as session:
        refreshed = session.get(User, user_id)
        assert refreshed is not None
        assert refreshed.storage_reserved == 2000  # 5000 - 3000

    # Cleanup
    with session_scope(engine) as session:
        session.query(Photo).filter(Photo.id == photo_id).delete()
        session.query(Gallery).filter(Gallery.id == gallery_id).delete()
        session.query(User).filter(User.id == user_id).delete()


def test_release_reserved_for_photos_empty_list_is_noop(engine: Engine) -> None:
    """Passing an empty list does nothing."""
    from viewport.background_tasks import _release_reserved_for_photos

    with session_scope(engine) as session:
        _release_reserved_for_photos(session, [])  # should not raise


# ── _decrement_used_for_owner_totals ─────────────────────────────────────


def test_decrement_used_for_owner_totals(engine: Engine) -> None:
    """_decrement_used_for_owner_totals decrements storage_used."""
    from viewport.background_tasks import _decrement_used_for_owner_totals

    user_id = None

    with session_scope(engine) as session:
        user = User(email=f"dec-used-{uuid4()}@example.com", password_hash="h", display_name="d", storage_used=8000)
        session.add(user)
        session.flush()
        user_id = user.id

        _decrement_used_for_owner_totals(session, [(user.id, 3000)])

    with session_scope(engine) as session:
        refreshed = session.get(User, user_id)
        assert refreshed is not None
        assert refreshed.storage_used == 5000  # 8000 - 3000

    # Cleanup
    with session_scope(engine) as session:
        session.query(User).filter(User.id == user_id).delete()


def test_process_single_photo_skips_when_photo_not_in_existing_ids(engine: Engine, s3_container, monkeypatch) -> None:
    """When photo_id is not in existing_ids, the photo is skipped."""

    with photo_context(engine, "skip-test", "skip.jpg") as ctx:
        s3_client = get_s3_client()
        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids=set(),  # empty → photo_id not in set
            result_tracker=tracker,
        )
        assert tracker.skipped == 1
        assert tracker.results[0]["status"] == "skipped"
        assert tracker.results[0]["message"] == "Photo deleted"


# ── _process_single_photo: S3 tag non-retryable errors ───────────────────


def test_process_single_photo_tagging_client_error_non_retryable(engine: Engine, s3_container, monkeypatch) -> None:
    """Non-retryable ClientError from put_object_tagging logs warning and continues."""
    from unittest.mock import MagicMock

    tag_error = ClientError(
        {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 403}},
        "PutObjectTagging",
    )

    with photo_context(engine, "tag-err-test", "tag.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock(side_effect=tag_error))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        # Processing continues past the tag error — thumbnail created successfully
        assert tracker.successful == 1


def test_process_single_photo_tagging_generic_exception_non_retryable(engine: Engine, s3_container, monkeypatch) -> None:
    """Generic non-ClientError from put_object_tagging logs warning and continues."""
    from unittest.mock import MagicMock

    with photo_context(engine, "tag-gen-test", "tag2.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock(side_effect=RuntimeError("unexpected")))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        assert tracker.successful == 1


# ── _process_single_photo: S3 get_object non-retryable non-NoSuchKey ─────


def test_process_single_photo_get_object_non_retryable_error(engine: Engine, s3_container, monkeypatch) -> None:
    """Non-retryable, non-NoSuchKey error from get_object adds error and returns."""
    from unittest.mock import MagicMock

    get_error = ClientError(
        {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 403}},
        "GetObject",
    )

    with photo_context(engine, "get-err-test", "get.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock())
        monkeypatch.setattr(s3_client, "get_object", MagicMock(side_effect=get_error))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        assert tracker.failed == 1
        assert tracker.results[0]["message"] == "S3 read failed"


# ── _process_single_photo: upload_fileobj non-retryable re-raised ────────


def test_process_single_photo_upload_non_retryable_raises(engine: Engine, s3_container, monkeypatch) -> None:
    """Non-retryable upload_fileobj error is caught by outer handler, tracked as failure."""
    from unittest.mock import MagicMock

    with photo_context(engine, "up-err-test", "up.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock())
        monkeypatch.setattr(s3_client, "upload_fileobj", MagicMock(side_effect=RuntimeError("upload boom")))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        assert tracker.failed == 1
        assert tracker.results[0]["message"] == "Processing failed"


# ── _process_single_photo: ThumbnailTransientError re-raised ─────────────


def test_process_single_photo_thumbnail_transient_error_propagates(engine: Engine, s3_container, monkeypatch) -> None:
    """ThumbnailTransientError is re-raised (bare raise on line 211)."""
    from unittest.mock import MagicMock

    with photo_context(engine, "transient-test", "trans.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock())
        get_error = ClientError(
            {"Error": {"Code": "InternalError"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 500}},
            "GetObject",
        )
        monkeypatch.setattr(s3_client, "get_object", MagicMock(side_effect=get_error))

        tracker = BatchTaskResult(1)
        with pytest.raises(ThumbnailTransientError):
            _process_single_photo(
                {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
                s3_client,
                get_s3_settings().bucket,
                existing_ids={str(ctx.photo_id)},
                result_tracker=tracker,
            )


# ── _process_single_photo: invalid image cleanup ClientError ─────────────


def test_process_single_photo_invalid_image_delete_client_error_swallowed(engine: Engine, s3_container, monkeypatch) -> None:
    """ClientError from delete_object during invalid-image cleanup is swallowed."""
    from unittest.mock import MagicMock

    with photo_context(engine, "inv-cleanup", "bad.jpg", content=b"not-an-image") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock())

        # s3_client.delete_object raises ClientError
        delete_error = ClientError(
            {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 403}},
            "DeleteObject",
        )
        monkeypatch.setattr(s3_client, "delete_object", MagicMock(side_effect=delete_error))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        # The photo is marked as error, processing does not crash
        assert tracker.failed == 1
        assert tracker.results[0]["message"] == "Invalid image file"


# ── _delete_photo_data_impl ──────────────────────────────────────────────


def test_delete_photo_data_impl_successful_photo(engine: Engine, s3_container) -> None:
    """Deleting a SUCCESSFUL photo removes it from S3+DB and decrements storage_used."""

    with photo_context(engine, "del-success", "del.jpg") as ctx:
        # Mark the photo as SUCCESSFUL and give the user matching storage_used
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.SUCCESSFUL
            user = session.get(User, ctx.user_id)
            assert user is not None
            user.storage_used = photo.file_size

        result = _delete_photo_data_impl(str(ctx.photo_id), str(ctx.gallery_id), str(ctx.user_id))
        assert result == {"deleted": True}

        # Verify DB cleanup
        with session_scope(engine) as session:
            assert session.get(Photo, ctx.photo_id) is None
            refreshed_user = session.get(User, ctx.user_id)
            assert refreshed_user is not None
            assert refreshed_user.storage_used == 0


def test_delete_photo_data_impl_pending_photo(engine: Engine, s3_container) -> None:
    """Deleting a PENDING photo decrements storage_reserved, NOT storage_used."""

    with photo_context(engine, "del-pending", "pend.jpg") as ctx:
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.PENDING
            user = session.get(User, ctx.user_id)
            assert user is not None
            user.storage_reserved = photo.file_size
            user.storage_used = 999  # should NOT change

        result = _delete_photo_data_impl(str(ctx.photo_id), str(ctx.gallery_id), str(ctx.user_id))
        assert result == {"deleted": True}

        with session_scope(engine) as session:
            refreshed_user = session.get(User, ctx.user_id)
            assert refreshed_user is not None
            assert refreshed_user.storage_reserved == 0
            assert refreshed_user.storage_used == 999  # unchanged


def test_delete_photo_data_impl_photo_not_found(engine: Engine) -> None:
    """Returns not-found when the photo doesn't exist."""

    result = _delete_photo_data_impl(str(uuid4()), str(uuid4()), str(uuid4()))
    assert result == {"deleted": False, "reason": "Photo not found"}


def test_delete_photo_data_impl_s3_no_such_key_swallowed(engine: Engine, s3_container, monkeypatch) -> None:
    """S3 NoSuchKey on delete_object is swallowed; DB row still removed."""

    no_such_key = ClientError(
        {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 404}},
        "DeleteObject",
    )

    with photo_context(engine, "del-nosuchkey", "nsk.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "delete_object", lambda **kw: (_ for _ in ()).throw(no_such_key))

        # Also patch get_s3_client to return our patched client
        monkeypatch.setattr(background_tasks, "get_s3_client", lambda: s3_client)

        result = _delete_photo_data_impl(str(ctx.photo_id), str(ctx.gallery_id), str(ctx.user_id))
        assert result == {"deleted": True}

        with session_scope(engine) as session:
            assert session.get(Photo, ctx.photo_id) is None


def test_delete_photo_data_impl_s3_access_denied_reraises(engine: Engine, s3_container, monkeypatch) -> None:
    """Non-NoSuchKey ClientError from delete_object is re-raised."""

    access_denied = ClientError(
        {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 403}},
        "DeleteObject",
    )

    with photo_context(engine, "del-accessdenied", "ad.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "delete_object", lambda **kw: (_ for _ in ()).throw(access_denied))
        monkeypatch.setattr(background_tasks, "get_s3_client", lambda: s3_client)

        with pytest.raises(ClientError):
            _delete_photo_data_impl(str(ctx.photo_id), str(ctx.gallery_id), str(ctx.user_id))


def test_delete_photo_data_impl_deletes_thumbnail_key(engine: Engine, s3_container) -> None:
    """When thumbnail_object_key differs from object_key, both are deleted from S3."""

    with photo_context(engine, "del-thumb", "thumb.jpg") as ctx:
        # Set a different thumbnail key
        thumb_key = f"{ctx.gallery_id}/thumb_{uuid4().hex[:8]}.avif"
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.thumbnail_object_key = thumb_key
            photo.status = PhotoUploadStatus.SUCCESSFUL
            # Upload a real thumbnail object so we can verify deletion
            s3_client = get_s3_client()
            s3_client.put_object(Bucket=get_s3_settings().bucket, Key=thumb_key, Body=b"thumbdata")

        result = _delete_photo_data_impl(str(ctx.photo_id), str(ctx.gallery_id), str(ctx.user_id))
        assert result == {"deleted": True}

        # Verify both original and thumbnail are gone from S3
        s3_client = get_s3_client()
        bucket = get_s3_settings().bucket
        with pytest.raises(ClientError) as exc_info:
            s3_client.head_object(Bucket=bucket, Key=ctx.object_key)
        assert exc_info.value.response["Error"]["Code"] == "404"
        with pytest.raises(ClientError) as exc_info2:
            s3_client.head_object(Bucket=bucket, Key=thumb_key)
        assert exc_info2.value.response["Error"]["Code"] == "404"


# ── delete_photo_data_task retry ─────────────────────────────────────────


# ── delete_photos_batch_task ─────────────────────────────────────────────


def test_delete_photos_batch_task_mixed_results(engine: Engine, s3_container, monkeypatch) -> None:
    """Batch delete with a mix of deleted, not_found, and failed photos."""

    # Prepare two real photos via photo_context, plus non-existent IDs
    with photo_context(engine, "batch-ok", "b1.jpg") as ctx1, photo_context(engine, "batch-fail", "b2.jpg") as ctx2:
        real_id1 = str(ctx1.photo_id)
        real_id2 = str(ctx2.photo_id)
        gallery_id = str(ctx1.gallery_id)
        owner_id = str(ctx1.user_id)
        fake_id = str(uuid4())
        failing_id = str(uuid4())

        # Make ctx2's photo fail by patching _delete_photo_data_impl
        original_impl = _delete_photo_data_impl

        def mock_impl(photo_id, gid, oid):
            if photo_id == failing_id:
                raise RuntimeError("boom")
            if photo_id == real_id2:
                raise RuntimeError("boom for real_id2")
            return original_impl(photo_id, gid, oid)

        monkeypatch.setattr(background_tasks, "_delete_photo_data_impl", mock_impl)

        result = delete_photos_batch_task.run(
            [real_id1, fake_id, real_id2, failing_id],
            gallery_id,
            owner_id,
        )

        assert real_id1 in result["deleted_ids"]
        assert fake_id in result["not_found_ids"]
        # real_id2 raised, failing_id raised → both in failed_ids
        assert real_id2 in result["failed_ids"]
        assert failing_id in result["failed_ids"]
        assert len(result["deleted_ids"]) == 1
        assert len(result["not_found_ids"]) == 1
        assert len(result["failed_ids"]) == 2


# ── cleanup_orphaned_uploads_task ────────────────────────────────────────


def test_cleanup_orphaned_uploads_deletes_pending_photo(engine: Engine, s3_container) -> None:
    """Orphaned PENDING photo older than 30 min is deleted along with its S3 objects."""
    from datetime import UTC, datetime, timedelta

    with photo_context(engine, "orphan-cleanup", "orphan.jpg") as ctx:
        # Make the photo PENDING with uploaded_at > 30 min ago
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.PENDING
            photo.uploaded_at = datetime.now(UTC) - timedelta(minutes=60)

        result = cleanup_orphaned_uploads_task.run()
        assert result["deleted_count"] >= 1

        # Verify photo removed from DB
        with session_scope(engine) as session:
            assert session.get(Photo, ctx.photo_id) is None

        # Verify S3 object deleted
        s3_client = get_s3_client()
        bucket = get_s3_settings().bucket
        with pytest.raises(ClientError) as exc_info:
            s3_client.head_object(Bucket=bucket, Key=ctx.object_key)
        assert exc_info.value.response["Error"]["Code"] == "404"


def test_cleanup_orphaned_uploads_empty_result(engine: Engine) -> None:
    """No matching photos → deleted_count is 0."""

    result = cleanup_orphaned_uploads_task.run()
    assert result == {"deleted_count": 0}


# ── delete_gallery_data_task: partial delete errors ──────────────────────


def test_delete_gallery_data_task_partial_delete_errors_retry(engine: Engine, s3_container, monkeypatch) -> None:
    """When delete_objects returns Errors, the task raises for Celery retry."""

    from viewport.background_tasks import delete_gallery_data_task

    with photo_context(engine, "partial-del", "pd.jpg") as ctx:
        gallery_id_str = str(ctx.gallery_id)

        s3_client = get_s3_client()

        # Mock list_objects_v2 to return the real objects
        real_list = s3_client.list_objects_v2

        def mock_list_objects_v2(**kwargs):
            result = real_list(**kwargs)
            return result

        def mock_delete_objects(**kwargs):
            return {
                "Errors": [{"Key": "some/key", "Code": "InternalError", "Message": "oops"}],
                "Deleted": [],
            }

        monkeypatch.setattr(s3_client, "list_objects_v2", mock_list_objects_v2)
        monkeypatch.setattr(s3_client, "delete_objects", mock_delete_objects)

        with pytest.raises(Exception, match="S3 partial delete errors"):
            delete_gallery_data_task.run(gallery_id_str)


# ── notify_selection_submitted_task / _notify_selection_submitted ─────────


class _FakeRedis:
    """Configurable fake Redis service for notification dedupe tests."""

    def __init__(
        self,
        *,
        available: bool = True,
        get_returns: str | None = None,
        get_raises: Exception | None = None,
        set_raises: Exception | None = None,
    ) -> None:
        self._available: bool = available
        self._get_returns: str | None = get_returns
        self._get_raises = get_raises
        self._set_raises = set_raises
        self.get_called = False
        self.set_called = False

    @property
    def is_available(self) -> bool:
        return self._available

    async def get(self, key: str) -> str | None:
        self.get_called = True
        if self._get_raises:
            raise self._get_raises
        return self._get_returns

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.set_called = True
        if self._set_raises:
            raise self._set_raises
        return True

    async def close(self) -> None:
        pass


def test_notify_selection_submitted_task_missing_sharelink_id() -> None:
    """Missing sharelink_id raises ValueError before any Redis call."""

    with pytest.raises(ValueError, match="sharelink_id and session_id are required"):
        notify_selection_submitted_task.run({"session_id": "s123"})


def test_notify_selection_submitted_task_missing_session_id() -> None:
    """Missing session_id raises ValueError before any Redis call."""

    with pytest.raises(ValueError, match="sharelink_id and session_id are required"):
        notify_selection_submitted_task.run({"sharelink_id": "sl456"})


def test_notify_selection_submitted_task_empty_strings_raise() -> None:
    """Empty strings for sharelink_id/session_id also trigger ValueError."""

    with pytest.raises(ValueError, match="sharelink_id and session_id are required"):
        notify_selection_submitted_task.run({"sharelink_id": "", "session_id": ""})


def test_delete_photo_data_task_retries_on_error(monkeypatch) -> None:
    """When _delete_photo_data_impl raises, the Celery task calls self.retry."""
    from unittest.mock import MagicMock, patch

    monkeypatch.setattr(
        background_tasks,
        "_delete_photo_data_impl",
        MagicMock(side_effect=RuntimeError("db down")),
    )

    with patch.object(delete_photo_data_task, "retry", side_effect=Exception("retry called"), create=True) as mock_retry, pytest.raises(Exception, match="retry called"):
        delete_photo_data_task.run("pid", "gid", "oid")

    mock_retry.assert_called_once()
    call_kwargs = mock_retry.call_args.kwargs
    assert isinstance(call_kwargs["exc"], RuntimeError)
    assert call_kwargs["countdown"] == 10


def test_notify_submitted_happy_path(monkeypatch) -> None:
    """Fresh notification: Redis get returns None → set called → success log emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    fake = _FakeRedis(available=True, get_returns=None)

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-1", {"client_name": "Test"}))
    assert result == {"sent": True, "deduped": False}
    assert fake.get_called is True
    assert fake.set_called is True


def test_notify_submitted_dedupe_hit(monkeypatch) -> None:
    """Redis get returns the marker → returns deduped, no success log emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    fake = _FakeRedis(available=True, get_returns="2026-01-01T00:00:00+00:00")

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-2", {}))
    assert result == {"sent": False, "deduped": True}
    assert fake.set_called is False  # set should NOT be called


def test_notify_submitted_redis_create_raises(monkeypatch) -> None:
    """Redis create raises → degraded mode → success log still emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    async def fake_create(*a, **kw):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-3", {}))
    assert result == {"sent": True, "deduped": False}


def test_notify_submitted_redis_get_raises(monkeypatch) -> None:
    """Redis get raises → falls through to set → success log emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    fake = _FakeRedis(available=True, get_raises=RuntimeError("redis timeout"))

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-4", {}))
    assert result == {"sent": True, "deduped": False}
    assert fake.set_called is True  # falls through to set


def test_notify_submitted_redis_set_raises(monkeypatch) -> None:
    """Redis set raises → warning logged → success log still emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    fake = _FakeRedis(available=True, get_returns=None, set_raises=RuntimeError("redis set fail"))

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-5", {}))
    assert result == {"sent": True, "deduped": False}


def test_notify_submitted_redis_unavailable(monkeypatch) -> None:
    """Redis create returns an unavailable service → degrades gracefully → log emitted."""
    import asyncio

    from viewport.background_tasks import RedisService, _notify_selection_submitted

    fake = _FakeRedis(available=False)

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = asyncio.run(_notify_selection_submitted("sl", "sess-6", {}))
    assert result == {"sent": True, "deduped": False}
    assert fake.get_called is False  # never called because unavailable


# ── _process_single_photo: retryable tag/upload errors ───────────────────
def test_process_single_photo_tagging_retryable_client_error(engine: Engine, s3_container, monkeypatch) -> None:
    """Retryable ClientError from put_object_tagging raises ThumbnailTransientError inside the inner try,
    which is caught by the outer S3 error handler (not retryable for ThumbnailTransientError type)."""
    from unittest.mock import MagicMock

    tag_error = ClientError(
        {"Error": {"Code": "InternalError"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 500}},
        "PutObjectTagging",
    )

    with photo_context(engine, "tag-retry", "tr.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock(side_effect=tag_error))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        # ThumbnailTransientError from tag is caught by outer except Exception handler
        assert tracker.failed == 1
        assert tracker.results[0]["message"] == "S3 read failed"


def test_process_single_photo_tagging_retryable_generic_exception(engine: Engine, s3_container, monkeypatch) -> None:
    """Retryable generic Exception from put_object_tagging → ThumbnailTransientError caught by outer handler."""
    from unittest.mock import MagicMock

    from botocore.exceptions import EndpointConnectionError

    with photo_context(engine, "tag-gen-retry", "tgr.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock(side_effect=EndpointConnectionError(endpoint_url="x")))

        tracker = BatchTaskResult(1)
        _process_single_photo(
            {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
            s3_client,
            get_s3_settings().bucket,
            existing_ids={str(ctx.photo_id)},
            result_tracker=tracker,
        )
        assert tracker.failed == 1
        assert tracker.results[0]["message"] == "S3 read failed"


def test_process_single_photo_upload_retryable_error(engine: Engine, s3_container, monkeypatch) -> None:
    """Retryable upload_fileobj error raises ThumbnailTransientError."""
    from unittest.mock import MagicMock

    with photo_context(engine, "up-retry", "ur.jpg") as ctx:
        s3_client = get_s3_client()
        monkeypatch.setattr(s3_client, "put_object_tagging", MagicMock())
        upload_error = ClientError(
            {"Error": {"Code": "ServiceUnavailable"}, "ResponseMetadata": {"RequestId": "", "HTTPHeaders": {}, "HostId": "", "RetryAttempts": 0, "HTTPStatusCode": 503}},
            "UploadPart",
        )
        monkeypatch.setattr(s3_client, "upload_fileobj", MagicMock(side_effect=upload_error))

        tracker = BatchTaskResult(1)
        with pytest.raises(ThumbnailTransientError):
            _process_single_photo(
                {"photo_id": str(ctx.photo_id), "object_key": ctx.object_key},
                s3_client,
                get_s3_settings().bucket,
                existing_ids={str(ctx.photo_id)},
                result_tracker=tracker,
            )


# ── delete_photos_batch_task: else branch (line 289) ─────────────────────


def test_delete_photos_batch_task_impl_returns_other_failure(engine: Engine, s3_container, monkeypatch) -> None:
    """When _delete_photo_data_impl returns non-deleted, non-not-found result, it goes to failed_ids."""
    from unittest.mock import MagicMock

    monkeypatch.setattr(
        background_tasks,
        "_delete_photo_data_impl",
        MagicMock(return_value={"deleted": False, "reason": "S3 inaccessible"}),
    )

    result = delete_photos_batch_task.run(
        [str(uuid4())],
        str(uuid4()),
        str(uuid4()),
    )
    assert len(result["failed_ids"]) == 1
    assert len(result["deleted_ids"]) == 0
    assert len(result["not_found_ids"]) == 0


# ── cleanup_orphaned_uploads: thumbnail key path (line 435) ──────────────


def test_cleanup_orphaned_uploads_deletes_thumbnail_key(engine: Engine, s3_container) -> None:
    """Orphaned photo with distinct thumbnail_object_key deletes both S3 keys."""
    from datetime import UTC, datetime, timedelta

    with photo_context(engine, "orphan-thumb", "ot.jpg") as ctx:
        thumb_key = f"{ctx.gallery_id}/thumb_orphan.avif"
        with session_scope(engine) as session:
            photo = session.get(Photo, ctx.photo_id)
            assert photo is not None
            photo.status = PhotoUploadStatus.PENDING
            photo.uploaded_at = datetime.now(UTC) - timedelta(minutes=60)
            photo.thumbnail_object_key = thumb_key

        # Upload a real thumbnail object
        s3_client = get_s3_client()
        bucket = get_s3_settings().bucket
        s3_client.put_object(Bucket=bucket, Key=thumb_key, Body=b"thumbdata")

        result = cleanup_orphaned_uploads_task.run()
        assert result["deleted_count"] >= 1

        # Both original and thumbnail deleted from S3
        with pytest.raises(ClientError) as exc_info:
            s3_client.head_object(Bucket=bucket, Key=ctx.object_key)
        assert exc_info.value.response["Error"]["Code"] == "404"
        with pytest.raises(ClientError) as exc_info2:
            s3_client.head_object(Bucket=bucket, Key=thumb_key)
        assert exc_info2.value.response["Error"]["Code"] == "404"


# ── notify_selection_submitted_task: run_async path (lines 666-667) ──────


def test_notify_selection_submitted_task_happy_path(monkeypatch) -> None:
    """Full end-to-end: notify_selection_submitted_task with valid payload calls Redis."""

    from viewport.background_tasks import RedisService

    fake = _FakeRedis(available=True, get_returns=None)

    async def fake_create(*a, **kw):
        return fake

    monkeypatch.setattr(RedisService, "create", fake_create)

    result = notify_selection_submitted_task.run({"sharelink_id": "sl-full", "session_id": "sess-full", "client_name": "EndToEnd"})
    assert result == {"sent": True, "deduped": False}
    assert fake.get_called is True
    assert fake.set_called is True
