import io
import uuid
from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from PIL import Image
from sqlalchemy import delete
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from viewport import background_tasks
from viewport.background_tasks import create_thumbnails_batch_task, delete_gallery_data_task, reconcile_successful_uploads_task
from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.s3_utils import S3Settings, get_s3_client, upload_fileobj
from viewport.task_utils import BatchTaskResult

IMAGE_SIZE = (640, 480)


class PhotoSetup(NamedTuple):
    photo_id: str
    gallery_id: str
    user_id: str
    object_key: str


@contextmanager
def session_scope(engine: Engine) -> Generator[Session]:
    session_local = sessionmaker(bind=engine)
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
            assert updated_photo.thumbnail_object_key.endswith("thumbnails/celery-original.jpg")
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
        original_precheck = background_tasks._get_existing_photo_ids

        def _delete_after_precheck(photo_ids: list[str]) -> set[str]:
            ids = original_precheck(photo_ids)
            with session_scope(engine) as session:
                session.query(Photo).filter(Photo.id == ctx.photo_id).delete()
            return ids

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
    tracker.successful = len(successful)

    @contextmanager
    def _failing_session():
        class DummySession:
            def execute(self, *args, **kwargs):
                raise RuntimeError("db down")

        yield DummySession()

    monkeypatch.setattr("viewport.task_utils.task_db_session", _failing_session)

    background_tasks._batch_update_photo_results(successful, tracker)

    assert tracker.failed == 1
    assert tracker.successful == 0
    assert successful[0]["status"] == "error"


def test_reconcile_successful_uploads_no_matching_photos(engine: Engine) -> None:
    """Test that reconcile_successful_uploads_task returns empty result when no photos match criteria."""
    from viewport.background_tasks import reconcile_successful_uploads_task

    result = reconcile_successful_uploads_task.run()

    assert result["requeued_count"] == 0


def test_reconcile_successful_uploads_selects_correct_photos(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task selects only SUCCESSFUL photos older than threshold with missing metadata."""

    with photo_context(engine, "reconcile-test", "photo1.jpg") as ctx1, photo_context(engine, "reconcile-test", "photo2.jpg") as ctx2, photo_context(engine, "reconcile-test", "photo3.jpg") as ctx3:
        with session_scope(engine) as session:
            # Photo 1: SUCCESSFUL, old, missing width (should match)
            photo1 = session.get(Photo, ctx1.photo_id)
            photo1.status = 2  # SUCCESSFUL
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            session.flush()

            # Photo 2: SUCCESSFUL, old, but has all metadata (should NOT match)
            photo2 = session.get(Photo, ctx2.photo_id)
            photo2.status = 2  # SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = 480
            photo2.thumbnail_object_key = "different-thumbnail-key"
            session.flush()

            # Photo 3: SUCCESSFUL, but recent (within threshold, should NOT match)
            photo3 = session.get(Photo, ctx3.photo_id)
            photo3.status = 2  # SUCCESSFUL
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
            photo1.status = 2  # SUCCESSFUL
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            session.flush()

            # Photo 2: SUCCESSFUL, old, missing metadata, from deleted gallery (should NOT match)
            photo2 = session.get(Photo, ctx2.photo_id)
            photo2.status = 2  # SUCCESSFUL
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = None
            gallery = session.get(Gallery, ctx2.gallery_id)
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


def test_reconcile_successful_uploads_max_batch_limit(engine: Engine, s3_container, monkeypatch) -> None:
    """Test that reconcile_successful_uploads_task respects the max_batch limit."""

    # Create a single gallery with 505 photos (more than max_batch of 500)
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

            session.flush()

        captured_calls = []

        original_delay = create_thumbnails_batch_task.delay

        def mock_delay(photos_batch):
            captured_calls.append(photos_batch)
            return original_delay(photos_batch)

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
            photo1.status = 2
            photo1.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo1.width = None
            photo1.height = 480
            photo1.thumbnail_object_key = "different-key"
            session.flush()

            # Photo 2: missing height
            photo2 = session.get(Photo, ctx2.photo_id)
            photo2.status = 2
            photo2.uploaded_at = datetime.now(UTC) - timedelta(minutes=10)
            photo2.width = 640
            photo2.height = None
            photo2.thumbnail_object_key = "different-key"
            session.flush()

            # Photo 3: thumbnail equals original (not yet processed)
            photo3 = session.get(Photo, ctx3.photo_id)
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
        thumbnail_key1 = f"{gallery.id}/thumbnails/photo1.jpg"
        upload_fileobj(content1, object_key1, content_type="image/jpeg")
        upload_fileobj(content1, thumbnail_key1, content_type="image/jpeg")

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
