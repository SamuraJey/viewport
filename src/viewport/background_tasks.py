import contextlib
import io
import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, TypedDict, cast

from botocore.exceptions import ClientError, ConnectionClosedError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError, SSLError
from celery.exceptions import SoftTimeLimitExceeded
from PIL import Image, UnidentifiedImageError
from sqlalchemy import and_, delete, func, or_, select, update

from viewport.celery_app import celery_app
from viewport.models.gallery import Gallery, MediaType, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.s3_utils import create_thumbnail, create_thumbnail_from_path, generate_playback_object_key, generate_thumbnail_object_key, get_s3_client, get_s3_settings
from viewport.services.redis_service import RedisService
from viewport.task_utils import BatchTaskResult, task_db_session
from viewport.thumbnail_tasks import ThumbnailTaskItem, ThumbnailTaskPayload, chunk_thumbnail_task_payloads, to_thumbnail_task_payloads
from viewport.video_metrics import VIDEO_QUEUE_DEPTH, report_cleanup_failure, report_derivative_sizes, report_original_size, report_processing_error, report_retry, report_transcode_duration

logger = logging.getLogger(__name__)

RETRYABLE_S3_ERROR_CODES = {
    "RequestTimeout",
    "RequestTimeTooSkewed",
    "SlowDown",
    "InternalError",
    "ServiceUnavailable",
    "Throttling",
    "ThrottlingException",
    "TooManyRequestsException",
}

SELECTION_SUBMIT_NOTIFY_KEY_PREFIX = "selection:submit:notify:"
SELECTION_SUBMIT_NOTIFY_TTL_SECONDS = 60 * 60 * 24 * 30
VIDEO_TEMP_DIR = os.environ.get("VIDEO_TEMP_DIR", "/tmp/video_processing")
VIDEO_TEMP_MAX_AGE_SECONDS = 2 * 60 * 60


class ThumbnailTransientError(Exception):
    """Retryable transient thumbnail processing error."""


class ThumbnailSourceError(Exception):
    """Wrap an S3 failure while streaming an original into local scratch space."""


class ThumbnailScratchError(Exception):
    """Retryable failure while creating or writing local thumbnail scratch data."""


class VideoTransientError(Exception):
    """Retryable transient video processing error."""


class VideoTaskPayload(TypedDict):
    """JSON-serializable wire payload consumed by the video processing Celery task."""

    photo_id: str
    object_key: str


def _is_retryable_s3_error(error: Exception) -> bool:
    if isinstance(error, (EndpointConnectionError, ConnectionClosedError, ConnectTimeoutError, ReadTimeoutError, SSLError)):
        return True

    if not isinstance(error, ClientError):
        return False

    error_response = cast(dict[str, Any], getattr(error, "response", {}) or {})
    error_data = cast(dict[str, Any], error_response.get("Error", {}) or {})
    error_code = cast(str, error_data.get("Code", ""))
    status_code = cast(int | None, error_response.get("ResponseMetadata", {}).get("HTTPStatusCode"))
    return error_code in RETRYABLE_S3_ERROR_CODES or status_code in {429, 500, 502, 503, 504}


if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client
    from mypy_boto3_s3.type_defs import DeleteTypeDef


def _is_valid_image(image_source: bytes | str | os.PathLike[str]) -> bool:
    """Validate image structure without decoding a full-resolution pixel buffer."""

    source: io.BytesIO | str | os.PathLike[str]
    source = io.BytesIO(image_source) if isinstance(image_source, bytes) else image_source
    try:
        with Image.open(source) as img:
            img.verify()
        return True
    except UnidentifiedImageError:
        return False
    except OSError as error:
        if not isinstance(image_source, bytes) and error.errno is not None:
            raise ThumbnailScratchError from error
        return False


@contextlib.contextmanager
def _stream_s3_object_to_tempfile(s3_client: "S3Client", bucket: str, object_key: str):
    """Stream an S3 body to an anonymous local file and yield its procfs path."""

    try:
        response = s3_client.get_object(Bucket=bucket, Key=object_key)
    except Exception as error:
        raise ThumbnailSourceError from error

    body = response["Body"]
    with contextlib.closing(body), contextlib.ExitStack() as scratch_stack:
        try:
            image_file = scratch_stack.enter_context(tempfile.TemporaryFile())
        except OSError as error:
            raise ThumbnailScratchError from error

        try:
            shutil.copyfileobj(body, image_file, length=1024 * 1024)
            image_file.flush()
            image_file.seek(0)
        except OSError as error:
            raise ThumbnailScratchError from error
        except Exception as error:
            raise ThumbnailSourceError from error
        yield f"/proc/self/fd/{image_file.fileno()}"


def _get_existing_photo_ids(photo_ids: list[str]) -> set[str]:
    """Check which photo IDs still exist in the database."""

    with task_db_session() as db:
        stmt = select(Photo.id).join(Photo.gallery).where(Photo.id.in_(photo_ids), Gallery.is_deleted.is_(False))
        return {str(row[0]) for row in db.execute(stmt).all()}


def _get_thumbnail_candidate_ids(photo_ids: list[str]) -> set[str]:
    """Return images that still need processing, excluding completed duplicates."""

    missing_metadata = or_(Photo.width.is_(None), Photo.height.is_(None), Photo.thumbnail_object_key == Photo.object_key)
    with task_db_session() as db:
        stmt = (
            select(Photo.id)
            .join(Photo.gallery)
            .where(
                Photo.id.in_(photo_ids),
                Gallery.is_deleted.is_(False),
                Photo.media_type == MediaType.IMAGE.value,
                or_(Photo.status == PhotoUploadStatus.PROCESSING, and_(Photo.status == PhotoUploadStatus.SUCCESSFUL, missing_metadata)),
            )
        )
        return {str(row[0]) for row in db.execute(stmt).all()}


def _release_reserved_for_photos(db, photo_ids: list[str]) -> None:
    if not photo_ids:
        return

    stmt = (
        select(Gallery.owner_id, func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id.in_(photo_ids)).group_by(Gallery.owner_id)
    )
    for owner_id, total in db.execute(stmt).all():
        db.execute(update(User).where(User.id == owner_id).values(storage_reserved=func.greatest(User.storage_reserved - total, 0)))


def _decrement_used_for_owner_totals(db, owner_totals: list[tuple[uuid.UUID, int]]) -> None:
    for owner_id, total in owner_totals:
        db.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - total, 0)))


def _process_single_photo(
    photo_data: ThumbnailTaskPayload,
    s3_client: "S3Client",
    bucket: str,
    existing_ids: set[str],
    result_tracker: BatchTaskResult,
) -> None:
    """Process a single photo: download, resize, and upload thumbnail."""

    photo_id = photo_data["photo_id"]
    object_key = photo_data["object_key"]

    try:
        # Check if photo was deleted
        if photo_id not in existing_ids:
            logger.info("Photo %s no longer exists in database, skipping", photo_id)
            result_tracker.add_skipped(photo_id, "Photo deleted")
            return

        # Check media_type — videos are processed by the video task, not here
        with task_db_session() as db:
            media_type_val = db.execute(select(Photo.media_type).where(Photo.id == uuid.UUID(photo_id))).scalar_one_or_none()
            if media_type_val == MediaType.VIDEO.value:
                logger.warning("Photo %s is a video, dispatched to thumbnail task in error; skipping", photo_id)
                result_tracker.add_skipped(photo_id, "Video dispatched to thumbnail task")
                return

        # Confirm the object tag before processing.
        try:
            s3_client.put_object_tagging(Bucket=bucket, Key=object_key, Tagging={"TagSet": [{"Key": "upload-status", "Value": "confirmed"}]})
        except ClientError as tag_error:
            if _is_retryable_s3_error(tag_error):
                raise ThumbnailTransientError(f"Retryable S3 tag error for {photo_id}") from tag_error
            logger.warning("Failed to update S3 tag for %s: %s", object_key, tag_error)
        except Exception as tag_general_error:
            if _is_retryable_s3_error(tag_general_error):
                raise ThumbnailTransientError(f"Retryable S3 tag error for {photo_id}") from tag_general_error
            logger.warning("Unexpected error updating S3 tag for %s: %s", object_key, tag_general_error)

        # Download the compressed original to disk, then let libvips stream it.
        try:
            with _stream_s3_object_to_tempfile(s3_client, bucket, object_key) as image_path:
                # Keep the historical validation/deletion behavior while avoiding
                # a second full-resolution raster allocation.
                if not _is_valid_image(image_path):
                    logger.warning(
                        "Object %s for photo %s is not a valid image",
                        object_key,
                        photo_id,
                    )

                    try:
                        s3_client.delete_object(Bucket=bucket, Key=object_key)
                    except ClientError as delete_error:
                        error_code = delete_error.response.get("Error", {}).get("Code", "")
                        if error_code == "NoSuchKey":
                            logger.info("Invalid S3 object %s already absent", object_key)
                        elif _is_retryable_s3_error(delete_error):
                            raise ThumbnailTransientError(f"Retryable S3 delete error for invalid object {photo_id}") from delete_error
                        else:
                            logger.error(
                                "Non-retryable S3 delete error for invalid object %s: %s; retaining photo row and quota",
                                object_key,
                                delete_error,
                            )
                            return

                    with task_db_session() as db_cleanup:
                        photo_row = db_cleanup.execute(
                            select(Photo.file_size, Gallery.owner_id).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id == photo_id)
                        ).one_or_none()
                        if photo_row:
                            file_size, owner_id = photo_row
                            db_cleanup.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - file_size, 0)))
                        db_cleanup.execute(delete(Photo).where(Photo.id == photo_id))

                    result_tracker.add_error(photo_id, "Invalid image file")
                    return
                thumbnail_bytes, width, height = create_thumbnail_from_path(image_path)
        except ThumbnailScratchError as scratch_error:
            raise ThumbnailTransientError(f"Retryable local scratch error for {photo_id}") from scratch_error
        except ThumbnailSourceError as source_error:
            cause = source_error.__cause__
            s3_error = cause if isinstance(cause, Exception) else source_error
            # Safely extract error code from boto3 exceptions
            error_response = cast(dict[str, Any], getattr(s3_error, "response", {}) or {})
            error_code = cast(str, error_response.get("Error", {}).get("Code", ""))

            if error_code == "NoSuchKey":
                logger.warning("File %s not found in S3, marking as failed", object_key)
                result_tracker.add_error(photo_id, "File not found in S3")
                return

            if _is_retryable_s3_error(s3_error):
                raise ThumbnailTransientError(f"Retryable S3 read error for {photo_id}") from s3_error

            logger.error("S3 non-retryable error for photo %s: %s", photo_id, str(s3_error))
            result_tracker.add_error(photo_id, "S3 read failed")
            return

        thumbnail_object_key = generate_thumbnail_object_key(object_key)

        # CRITICAL: Check again if photo still exists before uploading thumbnail
        with task_db_session() as db_check:
            photo_check_stmt = select(Photo.id).join(Photo.gallery).where(Photo.id == photo_id, Gallery.is_deleted.is_(False))
            if not db_check.execute(photo_check_stmt).scalar_one_or_none():
                logger.warning("Photo %s deleted during processing, skipping upload", photo_id)
                result_tracker.add_skipped(photo_id, "Photo deleted during processing")
                del thumbnail_bytes
                return

        # Upload thumbnail with aggressive caching (immutable content)
        try:
            s3_client.put_object(
                Body=thumbnail_bytes,
                Bucket=bucket,
                Key=thumbnail_object_key,
                ContentType="image/avif",
                CacheControl="public, max-age=31536000, immutable",
            )
        except Exception as upload_error:
            if _is_retryable_s3_error(upload_error):
                raise ThumbnailTransientError(f"Retryable S3 upload error for {photo_id}") from upload_error
            raise
        del thumbnail_bytes

        logger.info("Successfully created thumbnail for photo %s", photo_id)
        result_tracker.add_success(photo_id, thumbnail_object_key=thumbnail_object_key, width=width, height=height)

    except ThumbnailTransientError:
        raise
    except Exception as e:
        logger.exception("Failed to create thumbnail for photo %s: %s", photo_id, e)
        result_tracker.add_error(photo_id, "Processing failed", exception=e)


def _delete_photo_data_impl(photo_id: str, gallery_id: str, owner_id: str) -> dict:
    """Delete a single photo from S3 and the database."""

    photo_uuid = uuid.UUID(photo_id)
    gallery_uuid = uuid.UUID(gallery_id)
    owner_uuid = uuid.UUID(owner_id)

    with task_db_session() as db:
        photo = db.execute(
            select(
                Photo.object_key,
                Photo.thumbnail_object_key,
                Photo.playback_object_key,
                Photo.file_size,
                Photo.status,
                Photo.media_type,
            ).where(Photo.id == photo_uuid, Photo.gallery_id == gallery_uuid),
        ).one_or_none()

        if not photo:
            logger.warning("Photo %s not found in gallery %s", photo_id, gallery_id)
            return {"deleted": False, "reason": "Photo not found"}

        object_key, thumbnail_object_key, playback_object_key, file_size, status, media_type = photo

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket

    try:
        s3_client.delete_object(Bucket=bucket, Key=object_key)
    except ClientError as error:
        logger.warning("Failed to delete photo object %s: %s", object_key, error)
        if error.response.get("Error", {}).get("Code") != "NoSuchKey":
            report_cleanup_failure(media_type)
            raise

    if thumbnail_object_key and thumbnail_object_key != object_key:
        try:
            s3_client.delete_object(Bucket=bucket, Key=thumbnail_object_key)
        except ClientError as error:
            logger.warning("Failed to delete thumbnail %s: %s", thumbnail_object_key, error)
            if error.response.get("Error", {}).get("Code") != "NoSuchKey":
                report_cleanup_failure("image")
                raise

    if playback_object_key and playback_object_key != object_key:
        try:
            s3_client.delete_object(Bucket=bucket, Key=playback_object_key)
        except ClientError as error:
            logger.warning("Failed to delete playback %s: %s", playback_object_key, error)
            if error.response.get("Error", {}).get("Code") != "NoSuchKey":
                report_cleanup_failure("video")
                raise

    with task_db_session() as db:
        if status in (PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING):
            db.execute(update(User).where(User.id == owner_uuid).values(storage_used=func.greatest(User.storage_used - file_size, 0)))
        elif status == PhotoUploadStatus.PENDING:
            db.execute(update(User).where(User.id == owner_uuid).values(storage_reserved=func.greatest(User.storage_reserved - file_size, 0)))

        db.execute(delete(Photo).where(Photo.id == photo_uuid))

    logger.info("Deleted photo %s from gallery %s", photo_id, gallery_id)
    return {"deleted": True}


@celery_app.task(name="delete_photo_data", bind=True, max_retries=3, acks_late=True)
def delete_photo_data_task(self, photo_id: str, gallery_id: str, owner_id: str) -> dict:
    """Delete photo from S3 and hard-delete DB record, update storage quota."""
    try:
        return _delete_photo_data_impl(photo_id, gallery_id, owner_id)
    except Exception as exc:
        logger.exception("Failed to delete photo %s", photo_id)
        raise self.retry(exc=exc, countdown=10) from exc


@celery_app.task(name="delete_photos_batch", bind=True, acks_late=True)
def delete_photos_batch_task(self, photo_ids: list[str], gallery_id: str, owner_id: str) -> dict:
    """Delete many photos in a single worker task."""

    deleted_ids: list[str] = []
    failed_ids: list[str] = []
    not_found_ids: list[str] = []

    for photo_id in photo_ids:
        try:
            result = _delete_photo_data_impl(photo_id, gallery_id, owner_id)
            if result.get("deleted"):
                deleted_ids.append(photo_id)
            elif result.get("reason") == "Photo not found":
                not_found_ids.append(photo_id)
            else:
                failed_ids.append(photo_id)
        except Exception:
            logger.exception("Failed to delete photo %s during batch delete", photo_id)
            failed_ids.append(photo_id)

    return {
        "deleted_ids": deleted_ids,
        "failed_ids": failed_ids,
        "not_found_ids": not_found_ids,
    }


def _batch_update_photo_results(results: list[dict], result_tracker: BatchTaskResult) -> None:
    """Update database records and clear cache for processed photos."""

    # Exclude skipped items — they stay in their current DB status
    results = [r for r in results if r.get("status") != "skipped"]

    successful_results = [r for r in results if r["status"] == "success"]
    failed_results = [r for r in results if r["status"] == "error"]

    try:
        with task_db_session() as db:
            if successful_results:
                update_mappings = [
                    {
                        "id": r["photo_id"],
                        "thumbnail_object_key": r["thumbnail_object_key"],
                        "width": r["width"],
                        "height": r["height"],
                        "status": PhotoUploadStatus.SUCCESSFUL,
                    }
                    for r in successful_results
                ]
                logger.info("Batch updating %s photos with metadata in DB", len(update_mappings))
                db.execute(update(Photo), update_mappings)

            if failed_results:
                failed_ids = [r["photo_id"] for r in failed_results]
                logger.info("Batch marking %s photos as FAILED in DB", len(failed_ids))

                missing_metadata = or_(Photo.width.is_(None), Photo.height.is_(None), Photo.thumbnail_object_key == Photo.object_key)
                failure_eligible = or_(
                    Photo.status == PhotoUploadStatus.PROCESSING,
                    and_(Photo.status == PhotoUploadStatus.SUCCESSFUL, missing_metadata),
                )

                update_stmt = (
                    update(Photo)
                    .where(
                        Photo.id.in_(failed_ids),
                        failure_eligible,
                    )
                    .values(status=PhotoUploadStatus.FAILED)
                    .returning(Photo.id)
                )
                updated_rows = db.execute(update_stmt, execution_options={"synchronize_session": False}).all()
                updated_ids = [str(row[0]) for row in updated_rows]

                if updated_ids:
                    owner_totals = [
                        (owner_id, int(total_size))
                        for owner_id, total_size in db.execute(
                            select(Gallery.owner_id, func.coalesce(func.sum(Photo.file_size), 0))
                            .select_from(Photo)
                            .join(Gallery, Photo.gallery_id == Gallery.id)
                            .where(Photo.id.in_(updated_ids))
                            .group_by(Gallery.owner_id)
                        ).all()
                    ]
                    _decrement_used_for_owner_totals(db, owner_totals)

            db.commit()

    except Exception as exc:
        logger.exception("Failed to batch update photo results: %s", exc)
        raise ThumbnailTransientError("Failed to update photo results") from exc


@celery_app.task(
    name="create_thumbnails_batch",
    bind=True,
    max_retries=5,
    rate_limit="50/s",
    acks_late=True,
    autoretry_for=(ThumbnailTransientError,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def create_thumbnails_batch_task(self, photos: list[ThumbnailTaskPayload]) -> dict:
    """Background task to create thumbnails for multiple photos in one batch"""
    logger.info("Starting batch thumbnail creation for %s photos", len(photos))

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket

    result_tracker = BatchTaskResult(len(photos))

    photo_ids = [p["photo_id"] for p in photos]
    existing_ids = _get_thumbnail_candidate_ids(photo_ids)

    for photo_data in photos:
        _process_single_photo(photo_data, s3_client, bucket, existing_ids, result_tracker)

    if result_tracker.results:
        _batch_update_photo_results(result_tracker.results, result_tracker)

    logger.info("Batch completion: %s success, %s skipped, %s failed", result_tracker.successful, result_tracker.skipped, result_tracker.failed)
    return result_tracker.to_dict()


# --- Video processing ---------------------------------------------------------

MAX_VIDEO_DURATION_SECONDS = 1800


def _ffprobe_streams(filepath: str) -> dict[str, Any]:
    """Run ffprobe and return parsed JSON stream metadata.

    Raises subprocess.CalledProcessError on ffprobe failure.
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_type,codec_name,width,height,duration,r_frame_rate,pix_fmt:format=nb_streams",
            "-of",
            "json",
            filepath,
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    result.check_returncode()
    return cast(dict[str, Any], json.loads(result.stdout))


def _ffprobe_has_audio(filepath: str) -> bool:
    """Check whether the file has at least one audio stream."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            filepath,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        return False
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    return len(streams) > 0


def _cleanup_video_failure(
    photo_id: str,
    object_key: str,
    s3_client: "S3Client",
    bucket: str,
    error_message: str,
    derivative_keys: list[str] | None = None,
) -> None:
    """Delete original S3 object + derivatives and mark photo as FAILED with decremented quota.

    This is a best-effort cleanup. The hourly cleanup_orphaned_uploads_task
    sweeps any S3 objects left behind.
    """
    try:
        s3_client.delete_object(Bucket=bucket, Key=object_key)
    except ClientError as delete_error:
        logger.warning("Failed to delete invalid video S3 object %s: %s", object_key, delete_error)

    if derivative_keys:
        for dkey in derivative_keys:
            try:
                s3_client.delete_object(Bucket=bucket, Key=dkey)
            except ClientError as delete_error:
                logger.warning("Failed to delete derivative S3 object %s: %s", dkey, delete_error)

    with task_db_session() as db_cleanup:
        photo_row = db_cleanup.execute(select(Photo.file_size, Gallery.owner_id).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id == photo_id)).one_or_none()
        if photo_row:
            file_size, owner_id = photo_row
            db_cleanup.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - file_size, 0)))
        db_cleanup.execute(update(Photo).where(Photo.id == photo_id).values(status=PhotoUploadStatus.FAILED, processing_error=error_message))


def _process_single_video(
    video_data: VideoTaskPayload,
    s3_client: "S3Client",
    bucket: str,
    existing_ids: set[str],
    result_tracker: BatchTaskResult,
) -> None:
    """Process a single video: validate, transcode, generate poster, and upload."""

    photo_id = video_data["photo_id"]
    object_key = video_data["object_key"]

    try:
        # Check if photo was deleted
        if photo_id not in existing_ids:
            logger.info("Video %s no longer exists in database, skipping", photo_id)
            result_tracker.add_skipped(photo_id, "Photo deleted")
            return

        # Verify media type
        with task_db_session() as db_check:
            media_row = db_check.execute(select(Photo.media_type).where(Photo.id == photo_id)).one_or_none()
            if not media_row or media_row[0] != MediaType.VIDEO.value:
                logger.warning("Photo %s is not a video, skipping", photo_id)
                result_tracker.add_skipped(photo_id, "Not a video")
                return

        # Tag upload confirmed
        try:
            s3_client.put_object_tagging(
                Bucket=bucket,
                Key=object_key,
                Tagging={"TagSet": [{"Key": "upload-status", "Value": "confirmed"}]},
            )
        except ClientError as tag_error:
            if _is_retryable_s3_error(tag_error):
                raise VideoTransientError(f"Retryable S3 tag error for {photo_id}") from tag_error
            logger.warning("Failed to update S3 tag for %s: %s", object_key, tag_error)
        except Exception as tag_general_error:
            if _is_retryable_s3_error(tag_general_error):
                raise VideoTransientError(f"Retryable S3 tag error for {photo_id}") from tag_general_error
            logger.warning("Unexpected error updating S3 tag for %s: %s", object_key, tag_general_error)

        # --- Download original to temp file ---
        os.makedirs(VIDEO_TEMP_DIR, exist_ok=True)
        tmp_input_path: str | None = None
        tmp_output_path: str | None = None
        tmp_poster_path: str | None = None

        # Report original size for telemetry.
        try:
            head_response = s3_client.head_object(Bucket=bucket, Key=object_key)
            report_original_size(int(head_response.get("ContentLength", 0) or 0))
        except Exception:
            pass

        transcode_start = datetime.now(UTC)

        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False, dir=VIDEO_TEMP_DIR) as tmp_input:
                tmp_input_path = tmp_input.name
                try:
                    s3_client.download_fileobj(bucket, object_key, tmp_input)
                except ClientError as s3_error:
                    error_code = cast(dict[str, Any], getattr(s3_error, "response", {}) or {}).get("Error", {}).get("Code", "")
                    if error_code == "NoSuchKey":
                        logger.warning("Video file %s not found in S3, marking as failed", object_key)
                        result_tracker.add_error(photo_id, "File not found in S3")
                        return
                    if _is_retryable_s3_error(s3_error):
                        raise VideoTransientError(f"Retryable S3 download error for {photo_id}") from s3_error
                    logger.error("S3 non-retryable error for video %s: %s", photo_id, str(s3_error))
                    result_tracker.add_error(photo_id, "S3 download failed")
                    return

            # --- ffprobe validation ---
            try:
                probe_data = _ffprobe_streams(tmp_input_path)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as probe_error:
                logger.error("ffprobe failed for video %s: %s", photo_id, probe_error)
                report_processing_error("ffprobe_validation_failed", object_key)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "ffprobe validation failed")
                result_tracker.add_error(photo_id, "ffprobe validation failed")
                return

            streams = probe_data.get("streams", [])
            if not streams:
                logger.error("No video stream found in %s", photo_id)
                report_processing_error("no_video_stream", object_key)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "No video stream found")
                result_tracker.add_error(photo_id, "No video stream found")
                return

            video_stream = streams[0]
            duration = float(video_stream.get("duration", 0) or 0)
            width = int(video_stream.get("width", 0) or 0)
            height = int(video_stream.get("height", 0) or 0)
            nb_streams = int(probe_data.get("format", {}).get("nb_streams", video_stream.get("nb_streams", 1)) or 1)

            # Parse source FPS from r_frame_rate (format: "30000/1001" or "30/1")
            r_frame_rate = video_stream.get("r_frame_rate", "30/1") or "30/1"
            try:
                num, den = r_frame_rate.split("/")
                source_fps = float(num) / float(den) if float(den) != 0 else 30.0
            except ValueError, ZeroDivisionError:
                source_fps = 30.0
            target_fps = min(60.0, source_fps)

            if duration <= 0:
                logger.error("Video %s has zero or negative duration", photo_id)
                report_processing_error("invalid_duration", object_key)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "Invalid video duration")
                result_tracker.add_error(photo_id, "Invalid video duration")
                return

            if duration > MAX_VIDEO_DURATION_SECONDS:
                logger.error("Video %s duration %.1fs exceeds maximum %ds", photo_id, duration, MAX_VIDEO_DURATION_SECONDS)
                report_processing_error("duration_exceeded", object_key)
                _cleanup_video_failure(
                    photo_id,
                    object_key,
                    s3_client,
                    bucket,
                    f"Video duration {duration:.1f}s exceeds maximum {MAX_VIDEO_DURATION_SECONDS}s",
                )
                result_tracker.add_error(photo_id, "Video too long")
                return

            if nb_streams > 20:
                logger.error("Video %s has %d streams (too many)", photo_id, nb_streams)
                report_processing_error("too_many_streams", object_key)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "Too many streams")
                result_tracker.add_error(photo_id, "Too many streams")
                return

            duration_ms = int(duration * 1000)
            has_audio = _ffprobe_has_audio(tmp_input_path)

            # Fast path: remux video when already web-compatible H.264
            source_codec = (video_stream.get("codec_name") or "").lower()
            source_pix_fmt = (video_stream.get("pix_fmt") or "").lower()
            can_remux = source_codec == "h264" and width <= 1280 and source_pix_fmt == "yuv420p" and source_fps <= 60.0
            # --- Transcode with ffmpeg ---
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False, dir=VIDEO_TEMP_DIR) as tmp_out:
                tmp_output_path = tmp_out.name

            if can_remux:
                # Video already web-compatible — copy stream, only re-encode audio
                ffmpeg_cmd = [
                    "ffmpeg",
                    "-y",
                    "-i",
                    tmp_input_path,
                    "-c:v",
                    "copy",
                ]
                if has_audio:
                    ffmpeg_cmd += ["-c:a", "aac", "-b:a", "128k"]
                else:
                    ffmpeg_cmd += ["-an"]
                ffmpeg_cmd += ["-f", "mp4", "-movflags", "+faststart", tmp_output_path]
            else:
                # Build filter chain only for what actually needs changing
                filters: list[str] = []
                if width > 1280:
                    filters.append("scale='min(1280,iw)':-2,format=yuv420p")
                elif source_pix_fmt not in ("yuv420p", ""):
                    filters.append("format=yuv420p")
                if abs(target_fps - source_fps) > 0.01:
                    filters.append(f"fps=fps={target_fps}")

                ffmpeg_cmd = [
                    "ffmpeg",
                    "-y",
                    "-i",
                    tmp_input_path,
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "26",
                    "-maxrate",
                    "2M",
                    "-bufsize",
                    "4M",
                ]
                if filters:
                    ffmpeg_cmd += ["-vf", ",".join(filters)]
                if has_audio:
                    ffmpeg_cmd += ["-c:a", "aac", "-b:a", "128k"]
                else:
                    ffmpeg_cmd += ["-an"]
                ffmpeg_cmd += ["-f", "mp4", tmp_output_path]

            try:
                subprocess.run(
                    ffmpeg_cmd,
                    capture_output=True,
                    text=True,
                    timeout=1800,  # 30 min for long transcodes
                    check=True,
                )
            except subprocess.CalledProcessError as ffmpeg_error:
                logger.error("ffmpeg transcode failed for video %s: %s", photo_id, ffmpeg_error.stderr[-2000:] if ffmpeg_error.stderr else str(ffmpeg_error))
                report_processing_error("transcode_failed", object_key)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "Video transcoding failed")
                result_tracker.add_error(photo_id, "Video transcoding failed")
                return
            except subprocess.TimeoutExpired as timeout_err:
                logger.error("ffmpeg transcode timed out for video %s", photo_id)
                raise VideoTransientError(f"ffmpeg transcode timed out for {photo_id}") from timeout_err

            # --- Generate poster frame ---
            poster_ts = min(5.0, duration * 0.1)
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=VIDEO_TEMP_DIR) as tmp_poster_file:
                tmp_poster_path = tmp_poster_file.name

            poster_cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(poster_ts),
                "-i",
                tmp_input_path,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                tmp_poster_path,
            ]
            try:
                subprocess.run(poster_cmd, capture_output=True, text=True, timeout=30, check=True)
            except subprocess.CalledProcessError, subprocess.TimeoutExpired:
                # Fall back to first frame
                logger.warning("Poster extraction at %.1fs failed for %s, falling back to first frame", poster_ts, photo_id)
                poster_cmd = [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    "0",
                    "-i",
                    tmp_input_path,
                    "-frames:v",
                    "1",
                    "-q:v",
                    "2",
                    tmp_poster_path,
                ]
                try:
                    subprocess.run(poster_cmd, capture_output=True, text=True, timeout=30, check=True)
                except subprocess.CalledProcessError, subprocess.TimeoutExpired:
                    _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "Poster frame generation failed")
                    raise

            # Convert poster PNG to AVIF via create_thumbnail
            try:
                with open(tmp_poster_path, "rb") as pf:
                    poster_png_bytes = pf.read()
                poster_avif_bytes, poster_w, poster_h = create_thumbnail(poster_png_bytes)
            except Exception as poster_error:
                logger.error("Poster AVIF creation failed for %s: %s", photo_id, poster_error)
                _cleanup_video_failure(photo_id, object_key, s3_client, bucket, "Poster frame generation failed")
                result_tracker.add_error(photo_id, "Poster generation failed")
                return

            # --- Check photo still exists before uploading derivatives ---
            with task_db_session() as db_check:
                photo_exists = db_check.execute(select(Photo.id).join(Photo.gallery).where(Photo.id == photo_id, Gallery.is_deleted.is_(False))).scalar_one_or_none()
                if not photo_exists:
                    logger.warning("Video %s deleted during processing, skipping upload", photo_id)
                    result_tracker.add_skipped(photo_id, "Photo deleted during processing")
                    return

            # --- Upload playback MP4 ---
            playback_key = generate_playback_object_key(object_key)
            try:
                with open(tmp_output_path, "rb") as mp4_file:
                    s3_client.upload_fileobj(
                        mp4_file,
                        bucket,
                        playback_key,
                        ExtraArgs={
                            "ContentType": "video/mp4",
                            "CacheControl": "public, max-age=31536000, immutable",
                        },
                    )
            except Exception as upload_error:
                if _is_retryable_s3_error(upload_error):
                    raise VideoTransientError(f"Retryable S3 upload error for playback {photo_id}") from upload_error
                raise

            # --- Upload poster AVIF ---
            poster_key = generate_thumbnail_object_key(object_key)
            poster_io = io.BytesIO(poster_avif_bytes)
            try:
                s3_client.upload_fileobj(
                    poster_io,
                    bucket,
                    poster_key,
                    ExtraArgs={
                        "ContentType": "image/avif",
                        "CacheControl": "public, max-age=31536000, immutable",
                    },
                )
            except Exception as upload_error:
                if _is_retryable_s3_error(upload_error):
                    raise VideoTransientError(f"Retryable S3 upload error for poster {photo_id}") from upload_error
                _cleanup_video_failure(
                    photo_id,
                    object_key,
                    s3_client,
                    bucket,
                    "Poster upload failed",
                    derivative_keys=[playback_key],
                )
                result_tracker.add_error(photo_id, "Poster upload failed")
                return
            logger.info("Successfully processed video %s", photo_id)
            report_transcode_duration((datetime.now(UTC) - transcode_start).total_seconds())
            try:
                playback_size = os.path.getsize(tmp_output_path) if tmp_output_path else 0
                poster_size = len(poster_avif_bytes)
                report_derivative_sizes(playback_size, poster_size)
            except Exception:
                pass
            del poster_avif_bytes
            result_tracker.add_success(
                photo_id,
                playback_object_key=playback_key,
                thumbnail_object_key=poster_key,
                duration_ms=duration_ms,
                width=width,
                height=height,
            )

        finally:
            # Clean up temp files
            for tmp_path in (tmp_input_path, tmp_output_path, tmp_poster_path):
                if tmp_path and os.path.isfile(tmp_path):
                    with contextlib.suppress(OSError):
                        os.unlink(tmp_path)

    except VideoTransientError, SoftTimeLimitExceeded:
        raise
    except Exception as e:
        logger.exception("Failed to process video %s: %s", photo_id, e)
        result_tracker.add_error(photo_id, "Video processing failed", exception=e)


def _batch_update_video_results(results: list[dict], result_tracker: BatchTaskResult) -> None:
    """Update database records for processed videos."""

    successful_results = [r for r in results if r["status"] == "success"]
    failed_results = [r for r in results if r["status"] == "error"]

    try:
        with task_db_session() as db:
            if successful_results:
                update_mappings = [
                    {
                        "id": r["photo_id"],
                        "playback_object_key": r["playback_object_key"],
                        "thumbnail_object_key": r["thumbnail_object_key"],
                        "duration_ms": r["duration_ms"],
                        "width": r["width"],
                        "height": r["height"],
                        "status": PhotoUploadStatus.SUCCESSFUL,
                        "processing_error": None,
                    }
                    for r in successful_results
                ]
                logger.info("Batch updating %s videos with metadata in DB", len(update_mappings))
                db.execute(update(Photo), update_mappings)

            if failed_results:
                failed_ids = [r["photo_id"] for r in failed_results]
                logger.info("Batch marking %s videos as FAILED in DB", len(failed_ids))

                owner_totals = [
                    (owner_id, int(total_size))
                    for owner_id, total_size in db.execute(
                        select(Gallery.owner_id, func.coalesce(func.sum(Photo.file_size), 0))
                        .select_from(Photo)
                        .join(Gallery, Photo.gallery_id == Gallery.id)
                        .where(
                            Photo.id.in_(failed_ids),
                            Photo.status.in_([PhotoUploadStatus.PROCESSING, PhotoUploadStatus.SUCCESSFUL]),
                        )
                        .group_by(Gallery.owner_id)
                    ).all()
                ]

                db.execute(
                    update(Photo)
                    .where(
                        Photo.id.in_(failed_ids),
                        Photo.status.in_([PhotoUploadStatus.PROCESSING, PhotoUploadStatus.SUCCESSFUL]),
                    )
                    .values(status=PhotoUploadStatus.FAILED)
                )
                _decrement_used_for_owner_totals(db, owner_totals)

            db.commit()

    except Exception as exc:
        logger.exception("Failed to batch update video results: %s", exc)
        raise VideoTransientError("Failed to update video results") from exc


@celery_app.task(
    name="process_videos_batch",
    bind=True,
    max_retries=5,
    queue="video",
    rate_limit="10/s",
    acks_late=True,
    autoretry_for=(VideoTransientError,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    soft_time_limit=2400,  # 40 min — ffmpeg timeout is 1800s, leaves 600s cleanup headroom
    time_limit=2500,  # Hard limit above soft limit so SoftTimeLimitExceeded cleanup can run
)
def process_videos_batch_task(self, videos: list[VideoTaskPayload]) -> dict:
    """Background task to process videos: validate, transcode, and generate posters."""
    if self.request.retries == 0:
        VIDEO_QUEUE_DEPTH.dec(len(videos))
    else:
        report_retry()
    logger.info("Starting batch video processing for %s videos", len(videos))

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket

    result_tracker = BatchTaskResult(len(videos))

    photo_ids = [v["photo_id"] for v in videos]
    existing_ids = _get_existing_photo_ids(photo_ids)

    try:
        for video_data in videos:
            _process_single_video(video_data, s3_client, bucket, existing_ids, result_tracker)
    except SoftTimeLimitExceeded:
        logger.warning("Video batch soft time limit exceeded; persisting completed, requeuing remainder")

        # Persist results for videos that completed before the limit hit
        completed_results = list(result_tracker.results)
        if completed_results:
            _batch_update_video_results(completed_results, result_tracker)

        # Identify unfinished payloads (not tracked as success/error/skipped)
        processed_ids = {r["photo_id"] for r in completed_results}
        unfinished = [v for v in videos if v["photo_id"] not in processed_ids]

        if unfinished and self.request.retries < self.max_retries:
            logger.info(
                "Requeuing %d unfinished videos (retry %d/%d)",
                len(unfinished),
                self.request.retries + 1,
                self.max_retries,
            )
            raise self.retry(args=[unfinished]) from None

        if unfinished:
            logger.warning(
                "Max retries (%d) exhausted; marking %d videos as FAILED",
                self.max_retries,
                len(unfinished),
            )
            for v in unfinished:
                result_tracker.add_error(v["photo_id"], "Video processing timed out after max retries")

    if result_tracker.results:
        _batch_update_video_results(result_tracker.results, result_tracker)

    logger.info(
        "Video batch completion: %s success, %s skipped, %s failed",
        result_tracker.successful,
        result_tracker.skipped,
        result_tracker.failed,
    )
    return result_tracker.to_dict()


@celery_app.task(name="cleanup_video_temp_files")
def cleanup_video_temp_files_task() -> dict[str, int]:
    """Delete stale files left by interrupted video-processing workers."""
    threshold = datetime.now(UTC).timestamp() - VIDEO_TEMP_MAX_AGE_SECONDS
    deleted_count = 0
    failed_count = 0

    try:
        entries = os.scandir(VIDEO_TEMP_DIR)
    except FileNotFoundError:
        return {"deleted_count": 0, "failed_count": 0}
    except OSError as error:
        logger.warning("Failed to scan video temp directory %s: %s", VIDEO_TEMP_DIR, error)
        return {"deleted_count": 0, "failed_count": 1}

    with entries:
        for entry in entries:
            try:
                if not entry.is_file(follow_symlinks=False):
                    continue
                if entry.stat(follow_symlinks=False).st_mtime >= threshold:
                    continue
                os.unlink(entry.path)
                deleted_count += 1
            except OSError as error:
                failed_count += 1
                logger.warning("Failed to delete stale video temp file %s: %s", entry.path, error)

    logger.info(
        "Video temp cleanup removed %s stale files (%s failures)",
        deleted_count,
        failed_count,
    )
    return {"deleted_count": deleted_count, "failed_count": failed_count}


@celery_app.task(
    name="cleanup_orphaned_uploads",
    bind=True,
    max_retries=5,
    autoretry_for=(ThumbnailTransientError,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def cleanup_orphaned_uploads_task(self) -> dict:
    """
    Remove PENDING photo records older than 30 minutes and cleanup their S3 objects.
    """

    threshold = datetime.now(UTC) - timedelta(minutes=30)
    logger.info("Starting orphaned uploads cleanup (threshold: %s)", threshold)

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket
    batch_size = 250
    total_deleted = 0

    while True:
        with task_db_session() as db:
            stmt = (
                select(Photo)
                .where(
                    Photo.status.in_([PhotoUploadStatus.PENDING, PhotoUploadStatus.FAILED]),
                    Photo.uploaded_at < threshold,
                )
                .order_by(Photo.uploaded_at)
                .limit(batch_size)
            )
            chunk = db.execute(stmt).scalars().all()
            if not chunk:
                if total_deleted == 0:
                    logger.info("No photos found to clean up")
                break

            photo_ids = [p.id for p in chunk]
            object_keys = []
            for p in chunk:
                object_keys.append(p.object_key)
                if p.thumbnail_object_key and p.thumbnail_object_key != p.object_key:
                    object_keys.append(p.thumbnail_object_key)
                if p.playback_object_key and p.playback_object_key != p.object_key:
                    object_keys.append(p.playback_object_key)

            pending_ids = [str(p.id) for p in chunk if p.status == PhotoUploadStatus.PENDING]

            # Abort any in-progress multipart uploads (PENDING or FAILED) before
            # deleting objects — avoids leaked S3 multipart parts.
            for p in chunk:
                if p.multipart_upload_id:
                    try:
                        s3_client.abort_multipart_upload(
                            Bucket=bucket,
                            Key=p.object_key,
                            UploadId=p.multipart_upload_id,
                        )
                        logger.info("Aborted multipart upload %s for key %s", p.multipart_upload_id, p.object_key)
                    except ClientError as abort_error:
                        error_code = abort_error.response.get("Error", {}).get("Code", "")
                        if error_code in ("NoSuchKey", "NoSuchUpload"):
                            logger.info(
                                "Multipart upload %s for key %s already gone (code=%s)",
                                p.multipart_upload_id,
                                p.object_key,
                                error_code,
                            )
                        else:
                            logger.warning(
                                "Failed to abort multipart upload %s for key %s: %s",
                                p.multipart_upload_id,
                                p.object_key,
                                abort_error,
                            )

            # 1. Delete from S3 first to avoid orphans if DB deletion fails but task isn't retried
            # If S3 delete fails, the task will fail and retry (processing the same chunk)
            if object_keys:
                for i in range(0, len(object_keys), 1000):
                    batch = object_keys[i : i + 1000]
                    delete_request = cast("DeleteTypeDef", {"Objects": [{"Key": key} for key in batch]})
                    try:
                        response = s3_client.delete_objects(Bucket=bucket, Delete=delete_request)
                        errors = response.get("Errors") or []
                        if errors:
                            logger.error("Partial delete errors from S3: %s", errors)
                            # Raise retryable error; DB is untouched yet.
                            raise ThumbnailTransientError(f"S3 partial delete errors: {errors}")
                        logger.info("Deleted %s objects from S3", len(batch))
                    except Exception as e:
                        # Re-raise transient failures to trigger retry; DB is untouched yet.
                        logger.error("Failed to delete batch from S3: %s", e)
                        if _is_retryable_s3_error(e):
                            raise ThumbnailTransientError("Retryable S3 delete_objects error") from e
                        if isinstance(e, ThumbnailTransientError):
                            raise
                        raise

            # 2. Update DB and release quota only after S3 confirms deletion
            # This is atomic within the transaction block
            # Only release reserved bytes for PENDING rows. FAILED rows should
            # not decrement storage_used here because their quota transition is
            # handled at the point they become FAILED.
            _release_reserved_for_photos(db, pending_ids)
            delete_stmt = delete(Photo).where(Photo.id.in_(photo_ids))
            db.execute(delete_stmt)
            db.commit()  # Explicitly commit within the loop if needed, though session context handles it

        total_deleted += len(photo_ids)

    logger.info("Cleaned up %s orphaned photo records", total_deleted)
    return {"deleted_count": total_deleted}


@celery_app.task(name="delete_gallery_data", bind=True, max_retries=3, acks_late=True)
def delete_gallery_data_task(self, gallery_id: str) -> dict:
    """Delete all gallery objects in S3 and hard-delete DB rows."""
    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket
    prefix = f"{gallery_id}/"

    deleted_objects = 0
    try:
        continuation_token = None
        while True:
            list_params: dict = {"Bucket": bucket, "Prefix": prefix}
            if continuation_token:
                list_params["ContinuationToken"] = continuation_token

            list_response = s3_client.list_objects_v2(**list_params)
            objects = list_response.get("Contents", [])
            if objects:
                keys = [{"Key": obj["Key"]} for obj in objects]
                for i in range(0, len(keys), 1000):
                    batch = keys[i : i + 1000]
                    delete_response = s3_client.delete_objects(Bucket=bucket, Delete=cast("DeleteTypeDef", {"Objects": batch}))
                    errors = delete_response.get("Errors") or []
                    if errors:
                        logger.error("Partial delete errors when deleting gallery objects: %s", errors)
                        raise Exception(f"S3 partial delete errors: {errors}")
                    deleted_objects += len(batch)

            if not list_response.get("IsTruncated"):
                break
            continuation_token = list_response.get("NextContinuationToken")

        gallery_uuid = uuid.UUID(gallery_id)

        with task_db_session() as db:
            owner_row = db.execute(select(Gallery.owner_id).where(Gallery.id == gallery_uuid)).one_or_none()
            if owner_row:
                owner_id = owner_row[0]
                used_bytes = db.execute(
                    select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                        Photo.gallery_id == gallery_uuid,
                        Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING]),
                    )
                ).scalar_one()
                reserved_bytes = db.execute(
                    select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                        Photo.gallery_id == gallery_uuid,
                        Photo.status == PhotoUploadStatus.PENDING,
                    )
                ).scalar_one()
                db.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - used_bytes, 0)))
                db.execute(update(User).where(User.id == owner_id).values(storage_reserved=func.greatest(User.storage_reserved - reserved_bytes, 0)))
            db.execute(delete(Photo).where(Photo.gallery_id == gallery_uuid))
            db.execute(delete(ShareLink).where(ShareLink.gallery_id == gallery_uuid))
            db.execute(delete(Gallery).where(Gallery.id == gallery_uuid))

        logger.info("Deleted gallery %s: %s S3 objects removed", gallery_id, deleted_objects)
        return {"deleted_objects": deleted_objects}
    except Exception as exc:
        logger.exception("Failed to delete gallery data for %s", gallery_id)
        raise self.retry(exc=exc, countdown=30) from exc


@celery_app.task(name="reconcile_storage_quotas")
def reconcile_storage_quotas_task() -> dict:
    """Recalculate storage_used and storage_reserved for all users to fix any drifts.

    This is a safety task that ensures DB counters match the actual photo records.
    Can be run periodically (e.g., once a day).
    """
    reconciled_users = 0
    updated_users = 0

    with task_db_session() as db:
        # Precompute aggregated file sizes per user and status to avoid N+1 queries.
        # Start FROM Photo to make JOIN semantics explicit and portable across SQLAlchemy versions.
        usage_rows = db.execute(
            select(
                Gallery.owner_id,
                Photo.status,
                func.coalesce(func.sum(Photo.file_size), 0),
            )
            .select_from(Photo)
            .join(Gallery, Photo.gallery_id == Gallery.id)
            .where(
                Gallery.is_deleted.is_(False),
                Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING, PhotoUploadStatus.PENDING]),
            )
            .group_by(Gallery.owner_id, Photo.status)
        ).all()

        used_by_user: dict[uuid.UUID, int] = {}
        reserved_by_user: dict[uuid.UUID, int] = {}

        for owner_id, status, total_size in usage_rows:
            if status in (PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING):
                used_by_user[owner_id] = used_by_user.get(owner_id, 0) + total_size
            elif status == PhotoUploadStatus.PENDING:
                reserved_by_user[owner_id] = reserved_by_user.get(owner_id, 0) + total_size

        owner_ids = set(used_by_user) | set(reserved_by_user)
        users = (
            db.execute(
                select(User).where(
                    or_(
                        User.id.in_(owner_ids),
                        User.storage_used != 0,
                        User.storage_reserved != 0,
                    )
                )
            )
            .scalars()
            .all()
        )

        for user in users:
            reconciled_users += 1

            actual_used = used_by_user.get(user.id, 0)
            actual_reserved = reserved_by_user.get(user.id, 0)

            if user.storage_used != actual_used or user.storage_reserved != actual_reserved:
                logger.warning(
                    "Quota drift detected for user %s: used (%s -> %s), reserved (%s -> %s)",
                    user.id,
                    user.storage_used,
                    actual_used,
                    user.storage_reserved,
                    actual_reserved,
                )
                user.storage_used = actual_used
                user.storage_reserved = actual_reserved
                updated_users += 1

        db.commit()

    return {"reconciled_users": reconciled_users, "updated_users": updated_users}


@celery_app.task(name="reconcile_successful_uploads")
def reconcile_successful_uploads_task() -> dict:
    """Requeue successful uploads missing thumbnails/metadata."""

    threshold = datetime.now(UTC) - timedelta(minutes=5)
    max_batch = 500

    with task_db_session() as db:
        stmt = (
            select(Photo.id, Photo.object_key)
            .join(Photo.gallery)
            .where(
                Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING]),
                Gallery.is_deleted.is_(False),
                Photo.uploaded_at < threshold,
                or_(
                    Photo.width.is_(None),
                    Photo.height.is_(None),
                    Photo.thumbnail_object_key == Photo.object_key,
                ),
            )
            .limit(max_batch)
        )
        rows = db.execute(stmt).all()

    if not rows:
        return {"requeued_count": 0}

    photos = to_thumbnail_task_payloads(ThumbnailTaskItem(row[0], row[1]) for row in rows)
    for batch in chunk_thumbnail_task_payloads(photos):
        create_thumbnails_batch_task.delay(batch)
    logger.info("Requeued %s successful uploads missing thumbnails/metadata", len(photos))
    return {"requeued_count": len(photos)}


@celery_app.task(name="notify_selection_submitted", bind=True, max_retries=3, acks_late=True)
def notify_selection_submitted_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    """Send a lightweight submit notification marker for selection completion.

    MVP behavior:
    - mark the submit event in Redis for observability/idempotency across workers
    - log the payload so operators can route it to email/Telegram infrastructure
    """
    sharelink_id = str(payload.get("sharelink_id") or "")
    session_id = str(payload.get("session_id") or "")
    if not sharelink_id or not session_id:
        raise ValueError("sharelink_id and session_id are required")

    # Run all Redis + logging in a single event loop instead of spinning a fresh
    # asyncio.run() per call (each run_async() is a separate loop + round-trip).
    result = run_async(_notify_selection_submitted(sharelink_id, session_id, payload))
    return result if isinstance(result, dict) else {"sent": False, "deduped": False}


async def _notify_selection_submitted(sharelink_id: str, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Dedupe + emit the selection-submitted notification in one coroutine.

    Marks the submit event in Redis for cross-worker idempotency and logs the
    payload for downstream routing. Returns ``{"sent": False, "deduped": True}``
    without emitting the log when the session was already seen.
    """
    dedupe_key = f"{SELECTION_SUBMIT_NOTIFY_KEY_PREFIX}{session_id}"

    redis_service = None
    try:
        # Isolate Redis dedupe from the logging path: any unexpected error
        # while connecting/getting/setting must NOT block the selection-submitted
        # log below, so the notification still gets emitted downstream.
        try:
            redis_service = await RedisService.create()
        except Exception as redis_create_exc:
            logger.warning("Redis unavailable for selection dedupe, proceeding without dedupe: %s", redis_create_exc)
            redis_service = None
        if redis_service is not None and redis_service.is_available:
            try:
                already_seen = await redis_service.get(dedupe_key)
            except Exception as redis_get_exc:
                logger.warning("Redis GET failed for selection dedupe, proceeding without dedupe: %s", redis_get_exc)
                already_seen = None
            if already_seen:
                logger.info("Selection submit notification already sent for session %s", session_id)
                return {"sent": False, "deduped": True}
            try:
                await redis_service.set(
                    dedupe_key,
                    datetime.now(UTC).isoformat(),
                    ex=SELECTION_SUBMIT_NOTIFY_TTL_SECONDS,
                )
            except Exception as redis_set_exc:
                logger.warning("Redis SET failed for selection dedupe, proceeding without dedupe: %s", redis_set_exc)
    finally:
        if redis_service is not None:
            await redis_service.close()

    logger.info(
        "Selection submitted notification",
        extra={
            "sharelink_id": sharelink_id,
            "session_id": session_id,
            "client_name": payload.get("client_name"),
            "client_email": payload.get("client_email"),
            "selected_count": payload.get("selected_count"),
            "submitted_at": payload.get("submitted_at"),
        },
    )
    return {"sent": True, "deduped": False}


def run_async(coro: Any) -> Any:
    """Run async call from sync Celery task context."""
    import asyncio

    return asyncio.run(coro)
