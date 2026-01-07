import io
from collections.abc import Generator
from contextlib import contextmanager
from typing import NamedTuple
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from viewport import background_tasks
from viewport.minio_utils import S3Settings, get_s3_client, upload_fileobj
from viewport.models.gallery import Gallery, Photo
from viewport.models.user import User
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
def photo_context(engine: Engine, gallery_name: str, filename: str, content: bytes = None):
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


@pytest.mark.integration
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


@pytest.mark.integration
def test_create_thumbnails_batch_task_skips_missing_object(engine: Engine, s3_container) -> None:
    with photo_context(engine, "missing-test", "missing.jpg") as ctx:
        s3_client = get_s3_client()
        bucket = S3Settings().bucket
        s3_client.delete_object(Bucket=bucket, Key=ctx.object_key)

        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)

        assert_batch_counts(result, skipped=1)
        assert any(r["message"] == "File not found in S3" for r in result["results"])


@pytest.mark.integration
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


@pytest.mark.integration
def test_create_thumbnails_batch_task_reports_processing_errors(engine: Engine, s3_container) -> None:
    with photo_context(engine, "error-test", "broken.jpg", content=b"not-an-image") as ctx:
        result = _execute_thumbnail_task(str(ctx.photo_id), ctx.object_key)

        assert_batch_counts(result, failed=1)
        assert any(r["status"] == "error" for r in result["results"])

        with session_scope(engine) as session:
            updated_photo = session.get(Photo, ctx.photo_id)
            assert updated_photo.thumbnail_object_key == ctx.object_key


@pytest.mark.unit
def test_batch_update_photo_metadata_failure(monkeypatch):
    tracker = BatchTaskResult(1)
    successful = [{"photo_id": str(uuid4()), "thumbnail_object_key": "foo", "width": 10, "height": 20}]
    tracker.successful = len(successful)

    @contextmanager
    def _failing_session():
        class DummySession:
            def execute(self, *args, **kwargs):
                raise RuntimeError("db down")

        yield DummySession()

    monkeypatch.setattr("viewport.task_utils.task_db_session", _failing_session)

    background_tasks._batch_update_photo_metadata(successful, tracker)

    assert tracker.failed == 1
    assert tracker.successful == 0
    assert successful[0]["status"] == "error"
