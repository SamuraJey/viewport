"""Build missing publication JPEGs without changing published photo availability."""

import logging
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import select

from viewport.background_tasks import ThumbnailScratchError, ThumbnailSourceError, ThumbnailTransientError, _is_retryable_s3_error, _stream_s3_object_to_tempfile
from viewport.celery_app import celery_app
from viewport.models.gallery import Gallery, MediaType, Photo, PhotoUploadStatus
from viewport.photo_rotation import get_photo_delivery_key, is_rotation_pending
from viewport.s3_utils import create_publication_image_from_path, get_s3_client, get_s3_settings
from viewport.task_utils import BatchTaskResult, task_db_session

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _PublicationSnapshot:
    photo_id: uuid.UUID
    gallery_id: uuid.UUID
    delivery_key: str
    revision: int


def _needs_publication(photo: Photo) -> bool:
    return (
        photo.status == PhotoUploadStatus.SUCCESSFUL
        and photo.media_type == MediaType.IMAGE.value
        and photo.publication_object_key is None
        and photo.publication_file_size is None
        and not is_rotation_pending(photo)
    )


def _load_publication_snapshot(photo_id: uuid.UUID) -> _PublicationSnapshot | None:
    with task_db_session() as db:
        photo = db.scalar(select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.is_deleted.is_(False)))
        if photo is None or not _needs_publication(photo):
            return None
        return _PublicationSnapshot(photo.id, photo.gallery_id, get_photo_delivery_key(photo), photo.rotation_revision)


def _publish_publication(snapshot: _PublicationSnapshot, key: str, size: int) -> bool:
    with task_db_session() as db:
        gallery = db.scalar(select(Gallery).where(Gallery.id == snapshot.gallery_id, Gallery.is_deleted.is_(False)).with_for_update())
        if gallery is None:
            return False
        photo = db.scalar(select(Photo).where(Photo.id == snapshot.photo_id, Photo.gallery_id == snapshot.gallery_id).with_for_update())
        if photo is None or not _needs_publication(photo) or photo.rotation_revision != snapshot.revision or get_photo_delivery_key(photo) != snapshot.delivery_key:
            return False
        photo.publication_object_key = key
        photo.publication_file_size = size
    return True


def _create_publication_image(photo_id: str, client: "S3Client", bucket: str, result: BatchTaskResult) -> None:
    try:
        try:
            snapshot = _load_publication_snapshot(uuid.UUID(photo_id))
        except Exception as error:
            raise ThumbnailTransientError(f"Retryable DB error loading publication photo {photo_id}") from error
        if snapshot is None:
            result.add_skipped(photo_id, "Photo deleted, unavailable, rotating, or already has a publication file")
            return
        try:
            with _stream_s3_object_to_tempfile(client, bucket, snapshot.delivery_key) as source:
                publication = create_publication_image_from_path(source)
        except ThumbnailScratchError as error:
            raise ThumbnailTransientError(f"Retryable local scratch error for publication photo {photo_id}") from error
        except ThumbnailSourceError as error:
            cause = error.__cause__
            if isinstance(cause, Exception) and _is_retryable_s3_error(cause):
                raise ThumbnailTransientError(f"Retryable S3 read error for publication photo {photo_id}") from error
            raise
        size = len(publication)
        key = f"{snapshot.gallery_id}/{snapshot.photo_id}_rotations/{snapshot.revision}-{uuid.uuid4().hex}/publication.jpg"
        try:
            client.put_object(Bucket=bucket, Key=key, Body=publication, ContentType="image/jpeg", CacheControl="public, max-age=31536000, immutable")
        except Exception as error:
            if _is_retryable_s3_error(error):
                raise ThumbnailTransientError(f"Retryable S3 upload error for publication photo {photo_id}") from error
            raise
        finally:
            del publication
        try:
            published = _publish_publication(snapshot, key, size)
        except Exception as error:
            raise ThumbnailTransientError(f"Retryable DB error publishing photo {photo_id}") from error
        if published:
            result.add_success(photo_id, publication_object_key=key, publication_file_size=size)
        else:
            result.add_skipped(photo_id, "Photo changed or deleted during publication processing")
    except ThumbnailTransientError:
        raise
    except Exception as error:
        logger.exception("Could not create publication image for photo %s; keeping full-size photo available", photo_id)
        result.add_error(photo_id, "Publication processing failed", exception=error)


@celery_app.task(
    name="create_publication_images_batch",
    bind=True,
    max_retries=5,
    rate_limit="50/s",
    acks_late=True,
    autoretry_for=(ThumbnailTransientError,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def create_publication_images_batch_task(self, photo_ids: list[str]) -> dict:
    result = BatchTaskResult(len(photo_ids))
    client, bucket = get_s3_client(), get_s3_settings().bucket
    for photo_id in photo_ids:
        _create_publication_image(photo_id, client, bucket, result)
    return result.to_dict()
