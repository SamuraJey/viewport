import io
import os
import uuid
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from viewport import background_tasks, publication_tasks
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.s3_utils import _get_pyvips, get_s3_client, get_s3_settings
from viewport.task_utils import BatchTaskResult


@pytest.fixture
def native_publication_encoder():
    try:
        _get_pyvips()
    except (ImportError, OSError) as error:
        if os.environ.get("CI"):
            pytest.fail(f"libvips is required: {error}")
        pytest.skip(f"libvips is unavailable: {error}")


@pytest.fixture
def publication_photo(sync_engine):
    with Session(sync_engine) as db:
        owner = User(email=f"publication-{uuid.uuid4()}@example.com", password_hash="hash", display_name="Owner", storage_used=100, storage_reserved=25)
        db.add(owner)
        db.flush()
        gallery = Gallery(owner_id=owner.id, name="Publication backfill")
        db.add(gallery)
        db.flush()
        photo = Photo(gallery_id=gallery.id, object_key=f"{gallery.id}/source.jpg", thumbnail_object_key=f"{gallery.id}/thumbnail.avif", display_name="source.jpg", file_size=100, status=PhotoUploadStatus.SUCCESSFUL, width=640, height=480)
        db.add(photo)
        db.flush()
        ids = SimpleNamespace(photo_id=photo.id, gallery_id=gallery.id, owner_id=owner.id, source_key=photo.object_key)
        db.commit()
        return ids


def _upload_image(key, *, size=(640, 480), orientation=1):
    exif = Image.Exif()
    exif[274] = orientation
    content = io.BytesIO()
    Image.new("RGB", size, "orange").save(content, format="JPEG", exif=exif)
    get_s3_client().put_object(Bucket=get_s3_settings().bucket, Key=key, Body=content.getvalue(), ContentType="image/jpeg")


def test_backfill_encodes_published_rotated_delivery_without_changing_photo_or_quota(sync_engine, s3_container, publication_photo, native_publication_encoder):
    ids = publication_photo
    delivery_key = f"{ids.gallery_id}/{ids.photo_id}_rotations/3-existing/image.jpg"
    _upload_image(ids.source_key)
    _upload_image(delivery_key, size=(6000, 4000), orientation=6)
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        photo.rotated_object_key = delivery_key
        photo.rotation_revision = 3
        photo.rotation = 90
        photo.requested_rotation = 90
        photo.width, photo.height = 4000, 6000
        old_thumbnail = photo.thumbnail_object_key
        db.commit()
    result = publication_tasks.create_publication_images_batch_task.run([str(ids.photo_id)])
    assert result["successful"] == 1 and result["failed"] == 0
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        key, size = photo.publication_object_key, photo.publication_file_size
        assert f"{ids.photo_id}_rotations/3-" in key and key.endswith("/publication.jpg")
        assert photo.status == PhotoUploadStatus.SUCCESSFUL
        assert photo.object_key == ids.source_key and photo.rotated_object_key == delivery_key
        assert photo.thumbnail_object_key == old_thumbnail
        assert (photo.width, photo.height, photo.file_size) == (4000, 6000, 100)
        owner = db.get(User, ids.owner_id)
        assert (owner.storage_used, owner.storage_reserved) == (100, 25)
    response = get_s3_client().get_object(Bucket=get_s3_settings().bucket, Key=key)
    with response["Body"] as body:
        publication = body.read()
    assert size == len(publication)
    assert response["ContentType"] == "image/jpeg"
    assert response["CacheControl"].endswith("immutable")
    with Image.open(io.BytesIO(publication)) as image:
        assert image.format == "JPEG" and image.size == (1365, 2048)
        assert image.info.get("icc_profile")
        assert not image.getexif()
    duplicate = publication_tasks.create_publication_images_batch_task.run([str(ids.photo_id)])
    assert duplicate["skipped"] == 1 and duplicate["successful"] == 0
    with Session(sync_engine) as db:
        assert db.get(Photo, ids.photo_id).publication_object_key == key


@pytest.mark.parametrize("change", ("revision", "delivery", "pending", "deleted", "gallery_deleted", "already_published", "status"))
def test_backfill_does_not_publish_stale_uploaded_object(sync_engine, s3_container, publication_photo, monkeypatch, change):
    ids = publication_photo
    _upload_image(ids.source_key)
    monkeypatch.setattr(publication_tasks, "create_publication_image_from_path", lambda _path: b"jpeg")
    publish = publication_tasks._publish_publication
    uploaded = []

    def publish_after_change(snapshot, key, size):
        uploaded.append(key)
        with Session(sync_engine) as db:
            photo = db.get(Photo, ids.photo_id)
            if change == "revision":
                photo.rotation_revision += 1
            elif change == "delivery":
                photo.rotated_object_key = "new-delivery.jpg"
            elif change == "pending":
                photo.rotation_status = "pending"
            elif change == "deleted":
                db.delete(photo)
            elif change == "gallery_deleted":
                db.get(Gallery, ids.gallery_id).is_deleted = True
            elif change == "already_published":
                photo.publication_object_key, photo.publication_file_size = "winner.jpg", 30
            else:
                photo.status = PhotoUploadStatus.FAILED
            db.commit()
        return publish(snapshot, key, size)

    monkeypatch.setattr(publication_tasks, "_publish_publication", publish_after_change)
    result = publication_tasks.create_publication_images_batch_task.run([str(ids.photo_id)])
    assert result["skipped"] == 1 and result["successful"] == 0
    assert uploaded
    get_s3_client().head_object(Bucket=get_s3_settings().bucket, Key=uploaded[0])
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        if change == "deleted":
            assert photo is None
        else:
            expected = ("winner.jpg", 30) if change == "already_published" else (None, None)
            assert (photo.publication_object_key, photo.publication_file_size) == expected
            assert (photo.width, photo.height) == (640, 480)
            assert photo.thumbnail_object_key == f"{ids.gallery_id}/thumbnail.avif"
        owner = db.get(User, ids.owner_id)
        assert (owner.storage_used, owner.storage_reserved) == (100, 25)


@pytest.mark.parametrize("reason", ("video", "pending_rotation", "processing_rotation", "deleted_gallery", "ready", "unfinished", "deleted"))
def test_backfill_skips_ineligible_photos_before_s3(sync_engine, publication_photo, monkeypatch, reason):
    ids = publication_photo
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        if reason == "video":
            photo.media_type = "video"
        elif reason in ("pending_rotation", "processing_rotation"):
            photo.rotation_status = reason.removesuffix("_rotation")
        elif reason == "deleted_gallery":
            db.get(Gallery, ids.gallery_id).is_deleted = True
        elif reason == "ready":
            photo.publication_object_key, photo.publication_file_size = "ready.jpg", 20
        elif reason == "unfinished":
            photo.status = PhotoUploadStatus.PROCESSING
        else:
            db.delete(photo)
        db.commit()
    client = MagicMock()
    monkeypatch.setattr(publication_tasks, "get_s3_client", lambda: client)
    monkeypatch.setattr(publication_tasks, "get_s3_settings", lambda: SimpleNamespace(bucket="bucket"))
    result = publication_tasks.create_publication_images_batch_task.run([str(ids.photo_id)])
    assert result["skipped"] == 1
    client.get_object.assert_not_called()
    client.put_object.assert_not_called()


@pytest.mark.parametrize("missing", (True, False))
def test_permanent_backfill_error_keeps_successful_photo_available(sync_engine, s3_container, publication_photo, missing, native_publication_encoder):
    ids = publication_photo
    if not missing:
        get_s3_client().put_object(Bucket=get_s3_settings().bucket, Key=ids.source_key, Body=b"broken image")
    result = publication_tasks.create_publication_images_batch_task.run([str(ids.photo_id)])
    assert result["failed"] == 1 and result["successful"] == 0
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        assert photo.status == PhotoUploadStatus.SUCCESSFUL
        assert photo.publication_object_key is None and photo.publication_file_size is None
        assert photo.object_key == ids.source_key
        assert photo.thumbnail_object_key == f"{ids.gallery_id}/thumbnail.avif"
        assert (photo.width, photo.height) == (640, 480)
        assert db.get(User, ids.owner_id).storage_used == 100


@pytest.mark.parametrize("failure", ("source", "scratch", "upload", "database"))
def test_backfill_transient_failures_use_existing_retry_class(sync_engine, publication_photo, tmp_path, monkeypatch, failure):
    ids = publication_photo
    client = MagicMock()
    source = tmp_path / "source.jpg"
    Image.new("RGB", (20, 10)).save(source)

    @contextmanager
    def stream(*_args):
        if failure == "scratch":
            raise background_tasks.ThumbnailScratchError("no scratch space")
        if failure == "source":
            try:
                raise EndpointConnectionError(endpoint_url="https://s3.example")
            except EndpointConnectionError as error:
                raise background_tasks.ThumbnailSourceError from error
        yield str(source)

    monkeypatch.setattr(publication_tasks, "_stream_s3_object_to_tempfile", stream)
    monkeypatch.setattr(publication_tasks, "create_publication_image_from_path", lambda _path: b"jpeg")
    if failure == "upload":
        client.put_object.side_effect = ClientError({"Error": {"Code": "ServiceUnavailable"}, "ResponseMetadata": {"HTTPStatusCode": 503}}, "PutObject")
    elif failure == "database":
        monkeypatch.setattr(publication_tasks, "_publish_publication", MagicMock(side_effect=RuntimeError("database unavailable")))
    result = BatchTaskResult(1)
    with pytest.raises(background_tasks.ThumbnailTransientError):
        publication_tasks._create_publication_image(str(ids.photo_id), client, "bucket", result)
    assert not result.results
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        assert photo.status == PhotoUploadStatus.SUCCESSFUL and photo.publication_object_key is None


def test_split_publication_requests_separates_pending_and_ready(sync_engine, publication_photo):
    ids = publication_photo
    with Session(sync_engine) as db:
        db.get(Photo, ids.photo_id)
        ready = Photo(
            gallery_id=ids.gallery_id,
            object_key=f"{ids.gallery_id}/ready.jpg",
            thumbnail_object_key=f"{ids.gallery_id}/ready.avif",
            display_name="ready.jpg",
            file_size=100,
            width=640,
            height=480,
            status=PhotoUploadStatus.SUCCESSFUL,
            publication_object_key="pub.jpg",
            publication_file_size=50,
        )
        video = Photo(
            gallery_id=ids.gallery_id,
            object_key=f"{ids.gallery_id}/clip.mp4",
            thumbnail_object_key=f"{ids.gallery_id}/clip.avif",
            display_name="clip.mp4",
            file_size=1000,
            media_type="video",
            status=PhotoUploadStatus.SUCCESSFUL,
        )
        unfinished = Photo(
            gallery_id=ids.gallery_id,
            object_key=f"{ids.gallery_id}/half.jpg",
            thumbnail_object_key=f"{ids.gallery_id}/half.avif",
            display_name="half.jpg",
            file_size=100,
            status=PhotoUploadStatus.PROCESSING,
        )
        db.add_all([ready, video, unfinished])
        db.commit()
        rows = db.scalars(select(Photo).where(Photo.gallery_id == ids.gallery_id)).all()
        requested, skipped = publication_tasks._split_publication_requests(rows)
    assert requested == [str(ids.photo_id)]
    assert skipped == 1


@pytest.mark.parametrize(
    "mutate",
    (
        lambda photo_id: ("video", None),
        lambda photo_id: ("pending_rotation", None),
        lambda photo_id: ("unfinished", None),
    ),
    ids=("video", "pending_rotation", "unfinished"),
)
def test_request_gallery_publication_rejects_when_nothing_eligible(sync_engine, publication_photo, monkeypatch, mutate):
    import asyncio

    ids = publication_photo
    reason, _ = mutate(str(ids.photo_id))
    with Session(sync_engine) as db:
        photo = db.get(Photo, ids.photo_id)
        if reason == "video":
            photo.media_type = "video"
        elif reason == "pending_rotation":
            photo.rotation_status = "pending"
        else:
            photo.status = PhotoUploadStatus.PROCESSING
        db.commit()
        rows = db.scalars(select(Photo).where(Photo.gallery_id == ids.gallery_id)).all()
    enqueue = MagicMock()
    monkeypatch.setattr(publication_tasks.create_publication_images_batch_task, "delay", enqueue)
    with pytest.raises(Exception) as exc_info:
        asyncio.run(publication_tasks.request_gallery_publication(ids.gallery_id, list(rows)))
    assert "No photos found" in str(exc_info.value)
    enqueue.assert_not_called()


def test_request_gallery_publication_enqueues_backfill_batches(sync_engine, publication_photo, monkeypatch):
    import asyncio

    ids = publication_photo
    with Session(sync_engine) as db:
        gallery_id = ids.gallery_id
        photos = db.scalars(select(Photo).where(Photo.gallery_id == gallery_id)).all()
    batches = []
    monkeypatch.setattr(publication_tasks.create_publication_images_batch_task, "delay", lambda batch: batches.append(batch))
    response = asyncio.run(publication_tasks.request_gallery_publication(gallery_id, list(photos)))
    assert response.requested_count == 1 and response.skipped_count == 0
    assert batches == [[str(ids.photo_id)]]


def test_request_gallery_publication_rejects_more_than_500(sync_engine, publication_photo, monkeypatch):
    import asyncio

    ids = publication_photo
    enqueue = MagicMock()
    monkeypatch.setattr(publication_tasks.create_publication_images_batch_task, "delay", enqueue)
    photos = [SimpleNamespace(id=uuid.UUID(int=index), status=PhotoUploadStatus.SUCCESSFUL, media_type="image", publication_object_key=None, publication_file_size=None, rotation_status="ready") for index in range(501)]
    with pytest.raises(Exception) as exc_info:
        asyncio.run(publication_tasks.request_gallery_publication(ids.gallery_id, photos))
    assert "Too many photos" in str(exc_info.value)
    enqueue.assert_not_called()


@pytest.mark.parametrize("failed_batches, expected_count", [((), 25), ((1,), 15), ((0, 1, 2), 0)])
def test_publication_requests_reject_incomplete_queueing(monkeypatch, failed_batches, expected_count):
    import asyncio

    photos = [SimpleNamespace(id=uuid.uuid4(), status=PhotoUploadStatus.SUCCESSFUL, media_type="image", publication_object_key=None, publication_file_size=None, rotation_status="ready") for _ in range(25)]
    batches = []

    def enqueue(batch):
        batches.append(batch)
        if len(batches) - 1 in failed_batches:
            raise RuntimeError("Broker unavailable")

    monkeypatch.setattr(publication_tasks.create_publication_images_batch_task, "delay", enqueue)
    if expected_count == len(photos):
        result = asyncio.run(publication_tasks.request_gallery_publication(uuid.uuid4(), photos))
        assert result.requested_count == expected_count
        assert result.skipped_count == 0
    else:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(publication_tasks.request_gallery_publication(uuid.uuid4(), photos))
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == f"Queued {expected_count} of {len(photos)} publication files; please try again"
    assert [len(batch) for batch in batches] == [10, 10, 5]
    assert [photo_id for batch in batches for photo_id in batch] == [str(photo.id) for photo in photos]
