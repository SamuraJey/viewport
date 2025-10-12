import logging

from celery import Celery
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class CelerySettings(BaseSettings):
    broker_url: str = Field(default="redis://localhost:6379/0", alias="CELERY_BROKER_URL")
    result_backend: str = Field(default="redis://localhost:6379/0", alias="CELERY_RESULT_BACKEND")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = CelerySettings()

celery_app = Celery(
    "viewport",
    broker=settings.broker_url,
    backend=settings.result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    # Connection pool settings to prevent Redis connection exhaustion
    broker_pool_limit=None,  # No limit on broker connections (use Redis connection pooling)
    broker_connection_retry_on_startup=True,  # Retry connection on startup
    broker_connection_max_retries=10,  # Retry up to 10 times
)


@celery_app.task(name="create_thumbnail", bind=True, max_retries=3, rate_limit="150/s")  # pragma: no cover
def create_thumbnail_task(self, object_key: str, photo_id: str) -> dict:
    """Background task to create thumbnail for uploaded photo

    Rate limited to 150 tasks per second to avoid overwhelming database

    Args:
        object_key: S3 object key of the original photo
        photo_id: Database ID of the photo record

    Returns:
        dict with status and thumbnail info
    """
    try:
        logger.info(f"Starting thumbnail creation for photo {photo_id}, object_key: {object_key}")

        from src.viewport.db import get_session_maker
        from src.viewport.minio_utils import create_thumbnail, generate_thumbnail_object_key, get_s3_client, upload_fileobj
        from src.viewport.models.gallery import Photo

        # First, check if photo still exists in database (may have been deleted)
        session_maker = get_session_maker()
        with session_maker() as db:
            from sqlalchemy import select

            stmt = select(Photo).where(Photo.id == photo_id)
            photo = db.execute(stmt).scalar_one_or_none()

            if not photo:
                logger.info(f"Photo {photo_id} no longer exists in database, skipping thumbnail creation")
                return {"status": "skipped", "message": "Photo deleted", "photo_id": photo_id}

        # Get MinIO config
        from src.viewport.minio_utils import get_minio_config

        _, _, _, bucket = get_minio_config()

        # Download original from S3
        s3_client = get_s3_client()
        try:
            response = s3_client.get_object(Bucket=bucket, Key=object_key)
            image_bytes = response["Body"].read()
        except Exception as s3_error:
            # If file doesn't exist in S3 (NoSuchKey), don't retry - photo was likely deleted
            error_code = getattr(s3_error, "response", {}).get("Error", {}).get("Code", "")
            if error_code == "NoSuchKey":
                logger.info(f"File {object_key} not found in S3 (photo likely deleted), skipping thumbnail creation")
                return {"status": "skipped", "message": "File not found in S3", "photo_id": photo_id}
            # For other S3 errors, re-raise to trigger retry
            raise

        # Create thumbnail
        thumbnail_bytes = create_thumbnail(image_bytes)

        # Generate thumbnail object key
        thumbnail_object_key = generate_thumbnail_object_key(object_key)

        # Upload thumbnail to S3 with proper Content-Type
        upload_fileobj(thumbnail_bytes, thumbnail_object_key, content_type="image/jpeg")

        # Update database with thumbnail info using direct UPDATE query (faster, no row lock)
        # Note: width and height are already extracted during upload, so we only update thumbnail_object_key
        from sqlalchemy import update

        # Use context manager to ensure transaction is always closed properly
        session_maker = get_session_maker()
        with session_maker() as db:
            try:
                # Use direct UPDATE statement instead of ORM (avoids SELECT + row lock)
                # Only update thumbnail_object_key since dimensions are already set during upload
                stmt = update(Photo).where(Photo.id == photo_id).values(thumbnail_object_key=thumbnail_object_key)
                result = db.execute(stmt)
                db.commit()

                if result.rowcount == 0:
                    logger.warning(f"Photo {photo_id} not found in database")
                    return {"status": "error", "message": "Photo not found"}

                logger.info(f"Successfully created thumbnail for photo {photo_id}")
            except Exception as db_error:
                logger.error(f"Database update failed for photo {photo_id}: {db_error}")
                db.rollback()
                raise

        return {
            "status": "success",
            "photo_id": photo_id,
            "thumbnail_object_key": thumbnail_object_key,
        }

    except Exception as e:
        logger.error(f"Failed to create thumbnail for photo {photo_id}: {e}", exc_info=True)
        # Retry the task
        try:
            raise self.retry(exc=e, countdown=60)  # Retry after 1 minute
        except self.MaxRetriesExceededError:
            logger.error(f"Max retries exceeded for photo {photo_id}")
            return {"status": "error", "message": str(e), "photo_id": photo_id}


@celery_app.task(name="create_thumbnails_batch", bind=True, max_retries=3, rate_limit="10/s")  # pragma: no cover
def create_thumbnails_batch_task(self, photos: list[dict]) -> dict:
    """Background task to create thumbnails for multiple photos in one batch

    This reduces overhead significantly compared to individual tasks.
    Each photo dict should contain: object_key, photo_id

    Args:
        photos: List of dicts with 'object_key' and 'photo_id'

    Returns:
        dict with overall status and list of results per photo
    """
    logger.info(f"Starting batch thumbnail creation for {len(photos)} photos")

    results = []
    successful = 0
    skipped = 0
    failed = 0

    from sqlalchemy import select, update

    from src.viewport.db import get_session_maker

    # Get MinIO config once for all photos
    from src.viewport.minio_utils import create_thumbnail, generate_thumbnail_object_key, get_minio_config, get_s3_client, upload_fileobj
    from src.viewport.models.gallery import Photo

    _, _, _, bucket = get_minio_config()

    s3_client = get_s3_client()
    session_maker = get_session_maker()

    # First pass: Check which photos still exist in database
    with session_maker() as db:
        photo_ids = [p["photo_id"] for p in photos]
        stmt = select(Photo.id).where(Photo.id.in_(photo_ids))
        existing_photo_ids = {str(row[0]) for row in db.execute(stmt).all()}

    for photo_data in photos:
        object_key = photo_data["object_key"]
        photo_id = photo_data["photo_id"]

        try:
            # Check if photo was deleted
            if photo_id not in existing_photo_ids:
                logger.info(f"Photo {photo_id} no longer exists in database, skipping")
                results.append({"photo_id": photo_id, "status": "skipped", "message": "Photo deleted"})
                skipped += 1
                continue

            # Download original from S3
            try:
                response = s3_client.get_object(Bucket=bucket, Key=object_key)
                image_bytes = response["Body"].read()
            except Exception as s3_error:
                error_code = getattr(s3_error, "response", {}).get("Error", {}).get("Code", "")
                if error_code == "NoSuchKey":
                    logger.info(f"File {object_key} not found in S3, skipping")
                    results.append({"photo_id": photo_id, "status": "skipped", "message": "File not found in S3"})
                    skipped += 1
                    continue
                raise

            # Create thumbnail
            thumbnail_bytes = create_thumbnail(image_bytes)

            # Free memory immediately after creating thumbnail
            del image_bytes

            thumbnail_object_key = generate_thumbnail_object_key(object_key)

            # Upload thumbnail to S3 with proper Content-Type
            upload_fileobj(thumbnail_bytes, thumbnail_object_key, content_type="image/jpeg")

            # Free thumbnail memory
            del thumbnail_bytes

            # Store for batch UPDATE
            results.append({"photo_id": photo_id, "status": "success", "thumbnail_object_key": thumbnail_object_key})
            successful += 1

        except Exception as e:
            logger.error(f"Failed to create thumbnail for photo {photo_id}: {e}")
            results.append({"photo_id": photo_id, "status": "error", "message": str(e)})
            failed += 1

    # Batch UPDATE all successful thumbnails in one query
    if successful > 0:
        with session_maker() as db:
            try:
                # Build CASE statement for batch update
                # UPDATE photos SET thumbnail_object_key = CASE
                #   WHEN id = 'id1' THEN 'thumb1'
                #   WHEN id = 'id2' THEN 'thumb2'
                # END
                # WHERE id IN ('id1', 'id2', ...)

                from sqlalchemy import case

                successful_results = [r for r in results if r["status"] == "success"]
                photo_id_to_thumb = {r["photo_id"]: r["thumbnail_object_key"] for r in successful_results}

                if photo_id_to_thumb:
                    # Create CASE expression
                    when_clauses = [(Photo.id == pid, thumb) for pid, thumb in photo_id_to_thumb.items()]
                    case_expr = case(*when_clauses, else_=Photo.thumbnail_object_key)

                    # Execute batch UPDATE
                    stmt = update(Photo).where(Photo.id.in_(list(photo_id_to_thumb.keys()))).values(thumbnail_object_key=case_expr)
                    db.execute(stmt)
                    db.commit()

                    logger.info(f"Batch updated {len(photo_id_to_thumb)} photos with thumbnails")

            except Exception as db_error:
                logger.error(f"Batch database update failed: {db_error}")
                db.rollback()
                # Mark all as failed
                for result in results:
                    if result["status"] == "success":
                        result["status"] = "error"
                        result["message"] = "Database update failed"
                successful = 0
                failed = len(results)

    logger.info(f"Batch thumbnail creation complete: {successful} successful, {skipped} skipped, {failed} failed")

    return {"status": "complete", "total": len(photos), "successful": successful, "skipped": skipped, "failed": failed, "results": results}
