import io
import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import delete, select, update

from viewport.cache_utils import clear_presigned_urls_batch
from viewport.celery_app import celery_app
from viewport.models.gallery import Photo, PhotoUploadStatus
from viewport.s3_utils import create_thumbnail, generate_thumbnail_object_key, get_s3_client, get_s3_settings
from viewport.task_utils import BatchTaskResult

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client


def _get_existing_photo_ids(photo_ids: list[str]) -> set[str]:
    """Check which photo IDs still exist in the database."""
    from viewport.task_utils import task_db_session

    with task_db_session() as db:
        stmt = select(Photo.id).where(Photo.id.in_(photo_ids))
        return {str(row[0]) for row in db.execute(stmt).all()}


def _process_single_photo(
    photo_data: dict,
    s3_client: "S3Client",
    bucket: str,
    existing_ids: set[str],
    result_tracker: BatchTaskResult,
) -> None:
    """Process a single photo: download, resize, and upload thumbnail."""
    from viewport.task_utils import task_db_session

    photo_id = photo_data["photo_id"]
    object_key = photo_data["object_key"]

    try:
        # Check if photo was deleted
        if photo_id not in existing_ids:
            logger.info("Photo %s no longer exists in database, skipping", photo_id)
            result_tracker.add_skipped(photo_id, "Photo deleted")
            return

        # Download original from S3
        try:
            # First, update tagging to "confirmed" (moved from API for reliability)
            try:
                s3_client.put_object_tagging(Bucket=bucket, Key=object_key, Tagging={"TagSet": [{"Key": "upload-status", "Value": "confirmed"}]})
            except Exception as tag_error:
                logger.warning("Failed to update S3 tag for %s: %s", object_key, tag_error)

            response = s3_client.get_object(Bucket=bucket, Key=object_key)
            image_bytes = response["Body"].read()
        except Exception as s3_error:
            # Safely extract error code from boto3 exceptions
            response = getattr(s3_error, "response", {}) or {}
            error_code = response.get("Error", {}).get("Code", "")

            if error_code == "NoSuchKey":
                logger.warning("File %s not found in S3, marking as failed", object_key)
                result_tracker.add_error(photo_id, "File not found in S3")
                return

            # Re-raise session/connection errors to let Celery retry the whole batch
            logger.error("S3 error for photo %s: %s", photo_id, str(s3_error))
            raise

        # Create thumbnail
        thumbnail_bytes, width, height = create_thumbnail(image_bytes)
        del image_bytes  # Free memory ASAP

        thumbnail_object_key = generate_thumbnail_object_key(object_key)

        # CRITICAL: Check again if photo still exists before uploading thumbnail
        with task_db_session() as db_check:
            photo_check_stmt = select(Photo.id).where(Photo.id == photo_id)
            if not db_check.execute(photo_check_stmt).scalar_one_or_none():
                logger.warning("Photo %s deleted during processing, skipping upload", photo_id)
                result_tracker.add_skipped(photo_id, "Photo deleted during processing")
                del thumbnail_bytes
                return

        # Upload thumbnail
        thumbnail_io = io.BytesIO(thumbnail_bytes)
        s3_client.upload_fileobj(thumbnail_io, bucket, thumbnail_object_key, ExtraArgs={"ContentType": "image/jpeg"})
        del thumbnail_bytes

        logger.info("Successfully created thumbnail for photo %s", photo_id)
        result_tracker.add_success(photo_id, thumbnail_object_key=thumbnail_object_key, width=width, height=height)

    except Exception as e:
        logger.exception("Failed to create thumbnail for photo %s: %s", photo_id, e)
        result_tracker.add_error(photo_id, "Processing failed", exception=e)


def _batch_update_photo_results(results: list[dict], result_tracker: BatchTaskResult) -> None:
    """Update database records and clear cache for processed photos."""
    from viewport.task_utils import task_db_session

    successful_results = [r for r in results if r["status"] == "success"]
    failed_results = [r for r in results if r["status"] == "error"]

    try:
        with task_db_session() as db:
            # 1. Update metadata for successful photos
            if successful_results:
                update_mappings = [{"id": r["photo_id"], "thumbnail_object_key": r["thumbnail_object_key"], "width": r["width"], "height": r["height"]} for r in successful_results]
                logger.info("Batch updating %s photos with metadata in DB", len(update_mappings))
                db.execute(update(Photo), update_mappings)

            # 2. Mark failed photos as FAILED (Fixes "lying" SUCCESSFUL status from API)
            if failed_results:
                failed_ids = [r["photo_id"] for r in failed_results]
                logger.info("Batch marking %s photos as FAILED in DB", len(failed_ids))
                db.execute(update(Photo).where(Photo.id.in_(failed_ids)).values(status=PhotoUploadStatus.FAILED))

        # Invalidate cache for successful thumbnails
        if successful_results:
            thumbnail_keys = [r["thumbnail_object_key"] for r in successful_results]
            clear_presigned_urls_batch(thumbnail_keys)

    except Exception as db_error:
        logger.error("Batch database update failed: %s", db_error)
        # Convert successes in this batch to failures because they weren't persisted
        for r in successful_results:
            result_tracker.failed += 1
            result_tracker.successful -= 1
            r["status"] = "error"
            r["message"] = f"Database update failed: {db_error}"


@celery_app.task(name="create_thumbnails_batch", bind=True, max_retries=3, rate_limit="50/s", acks_late=True)
def create_thumbnails_batch_task(self, photos: list[dict]) -> dict:
    """Background task to create thumbnails for multiple photos in one batch"""
    logger.info("Starting batch thumbnail creation for %s photos", len(photos))

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket

    result_tracker = BatchTaskResult(len(photos))

    # 1. Pre-check photos in database
    photo_ids = [p["photo_id"] for p in photos]
    existing_ids = _get_existing_photo_ids(photo_ids)

    # 2. Process each photo
    for photo_data in photos:
        _process_single_photo(photo_data, s3_client, bucket, existing_ids, result_tracker)

    # 3. Batch update records (including failures)
    if result_tracker.results:
        _batch_update_photo_results(result_tracker.results, result_tracker)

    logger.info("Batch completion: %s success, %s skipped, %s failed", result_tracker.successful, result_tracker.skipped, result_tracker.failed)
    return result_tracker.to_dict()


@celery_app.task(name="cleanup_orphaned_uploads")
def cleanup_orphaned_uploads_task() -> dict:
    """
    Remove PENDING photo records older than 1 hour and cleanup their S3 objects.
    """
    from viewport.task_utils import task_db_session

    threshold = datetime.now(UTC) - timedelta(hours=1)
    logger.info("Starting orphaned uploads cleanup (threshold: %s)", threshold)

    with task_db_session() as db:
        # 1. Find orphaned or failed photos
        stmt = select(Photo).where(
            Photo.status.in_([PhotoUploadStatus.PENDING, PhotoUploadStatus.FAILED]),
            Photo.uploaded_at < threshold,
        )
        orphaned_photos = db.execute(stmt).scalars().all()

        if not orphaned_photos:
            logger.info("No photos found to clean up")
            return {"deleted_count": 0}

        photo_ids = [p.id for p in orphaned_photos]
        object_keys = []
        for p in orphaned_photos:
            object_keys.append(p.object_key)
            # If thumbnail is different, add it too
            if p.thumbnail_object_key and p.thumbnail_object_key != p.object_key:
                object_keys.append(p.thumbnail_object_key)

        # 2. Delete from S3
        if object_keys:
            s3_client = get_s3_client()
            bucket = get_s3_settings().bucket

            # S3 delete_objects can take up to 1000 keys
            for i in range(0, len(object_keys), 1000):
                batch = object_keys[i : i + 1000]
                delete_request = {"Objects": [{"Key": key} for key in batch]}
                try:
                    s3_client.delete_objects(Bucket=bucket, Delete=delete_request)
                    logger.info("Deleted %s objects from S3", len(batch))
                except Exception as e:
                    logger.error("Failed to delete batch from S3: %s", e)

        # 3. Delete from DB
        delete_stmt = delete(Photo).where(Photo.id.in_(photo_ids))
        db.execute(delete_stmt)

        logger.info("Cleaned up %s orphaned photo records", len(photo_ids))
        return {"deleted_count": len(photo_ids)}
