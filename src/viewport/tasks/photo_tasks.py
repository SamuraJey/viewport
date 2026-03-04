import io
import logging
import uuid
from typing import TYPE_CHECKING, Any, cast

from botocore.exceptions import ClientError
from PIL import Image, UnidentifiedImageError
from sqlalchemy import delete, func, select, update
from taskiq import TaskiqDepends

from ..cache_utils import clear_presigned_urls_batch
from ..dependencies import get_task_context, get_task_s3_client
from ..models.gallery import Gallery, Photo, PhotoUploadStatus
from ..models.user import User
from ..s3_utils import create_thumbnail, generate_thumbnail_object_key
from ..task_utils import BatchTaskResult, task_db_session
from ..tkq import broker

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client


TASK_S3_DEP = TaskiqDepends(get_task_s3_client)
TASK_CONTEXT_DEP = TaskiqDepends(get_task_context)


def _is_valid_image(image_bytes: bytes) -> bool:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
        return True
    except (UnidentifiedImageError, OSError):
        return False


def _get_existing_photo_ids(photo_ids: list[str]) -> set[str]:
    with task_db_session() as db:
        stmt = select(Photo.id).join(Photo.gallery).where(Photo.id.in_(photo_ids), Gallery.is_deleted.is_(False))
        return {str(row[0]) for row in db.execute(stmt).all()}


def _decrement_used_for_photos(db, photo_ids: list[str]) -> None:
    if not photo_ids:
        return

    stmt = (
        select(Gallery.owner_id, func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id.in_(photo_ids)).group_by(Gallery.owner_id)
    )
    for owner_id, total in db.execute(stmt).all():
        db.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - total, 0)))


def _process_single_photo(
    photo_data: dict,
    s3_client: "S3Client",
    bucket: str,
    existing_ids: set[str],
    result_tracker: BatchTaskResult,
) -> None:
    photo_id = photo_data["photo_id"]
    object_key = photo_data["object_key"]

    try:
        if photo_id not in existing_ids:
            logger.info("Photo %s no longer exists in database, skipping", photo_id)
            result_tracker.add_skipped(photo_id, "Photo deleted")
            return

        try:
            try:
                s3_client.put_object_tagging(Bucket=bucket, Key=object_key, Tagging={"TagSet": [{"Key": "upload-status", "Value": "confirmed"}]})
            except ClientError as tag_error:
                logger.warning("Failed to update S3 tag for %s: %s", object_key, tag_error)
            except Exception as tag_general_error:
                logger.warning("Unexpected error updating S3 tag for %s: %s", object_key, tag_general_error)

            response = s3_client.get_object(Bucket=bucket, Key=object_key)
            image_bytes = response["Body"].read()
        except Exception as s3_error:
            error_response = cast(dict[str, Any], getattr(s3_error, "response", {}) or {})
            error_code = cast(str, error_response.get("Error", {}).get("Code", ""))

            if error_code == "NoSuchKey":
                logger.warning("File %s not found in S3, marking as failed", object_key)
                result_tracker.add_error(photo_id, "File not found in S3")
                return

            logger.error("S3 error for photo %s: %s", photo_id, str(s3_error))
            raise

        if not _is_valid_image(image_bytes):
            logger.warning("Object %s for photo %s is not a valid image", object_key, photo_id)

            try:
                s3_client.delete_object(Bucket=bucket, Key=object_key)
            except ClientError as delete_error:
                logger.warning("Failed to delete invalid S3 object %s: %s", object_key, delete_error)

            with task_db_session() as db_cleanup:
                photo_row = db_cleanup.execute(select(Photo.file_size, Gallery.owner_id).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id == photo_id)).one_or_none()
                if photo_row:
                    file_size, owner_id = photo_row
                    db_cleanup.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - file_size, 0)))
                db_cleanup.execute(delete(Photo).where(Photo.id == photo_id))

            result_tracker.add_error(photo_id, "Invalid image file")
            return

        thumbnail_bytes, width, height = create_thumbnail(image_bytes)
        del image_bytes

        thumbnail_object_key = generate_thumbnail_object_key(object_key)

        with task_db_session() as db_check:
            photo_check_stmt = select(Photo.id).join(Photo.gallery).where(Photo.id == photo_id, Gallery.is_deleted.is_(False))
            if not db_check.execute(photo_check_stmt).scalar_one_or_none():
                logger.warning("Photo %s deleted during processing, skipping upload", photo_id)
                result_tracker.add_skipped(photo_id, "Photo deleted during processing")
                del thumbnail_bytes
                return

        thumbnail_io = io.BytesIO(thumbnail_bytes)
        s3_client.upload_fileobj(
            thumbnail_io,
            bucket,
            thumbnail_object_key,
            ExtraArgs={
                "ContentType": "image/avif",
                "CacheControl": "public, max-age=31536000, immutable",
            },
        )
        del thumbnail_bytes

        logger.info("Successfully created thumbnail for photo %s", photo_id)
        result_tracker.add_success(photo_id, thumbnail_object_key=thumbnail_object_key, width=width, height=height)

    except Exception as e:
        logger.exception("Failed to create thumbnail for photo %s: %s", photo_id, e)
        result_tracker.add_error(photo_id, "Processing failed", exception=e)


def _batch_update_photo_results(results: list[dict], result_tracker: BatchTaskResult) -> None:
    successful_results = [r for r in results if r["status"] == "success"]
    failed_results = [r for r in results if r["status"] == "error"]

    try:
        with task_db_session() as db:
            if successful_results:
                update_mappings = [{"id": r["photo_id"], "thumbnail_object_key": r["thumbnail_object_key"], "width": r["width"], "height": r["height"]} for r in successful_results]
                logger.info("Batch updating %s photos with metadata in DB", len(update_mappings))
                db.execute(update(Photo), update_mappings)

            if failed_results:
                failed_ids = [r["photo_id"] for r in failed_results]
                logger.info("Batch marking %s photos as FAILED in DB", len(failed_ids))
                db.execute(update(Photo).where(Photo.id.in_(failed_ids)).values(status=PhotoUploadStatus.FAILED))
                _decrement_used_for_photos(db, failed_ids)

        if successful_results:
            thumbnail_keys = [r["thumbnail_object_key"] for r in successful_results]
            clear_presigned_urls_batch(thumbnail_keys)

    except Exception as db_error:
        logger.error("Batch database update failed: %s", db_error)
        for r in successful_results:
            result_tracker.failed += 1
            result_tracker.successful -= 1
            r["status"] = "error"
            r["message"] = f"Database update failed: {db_error}"


def create_thumbnails_batch_task_impl(photos: list[dict], s3_client: "S3Client" | None = None, bucket: str | None = None) -> dict:
    logger.info("Starting batch thumbnail creation for %s photos", len(photos))

    from ..s3_utils import get_s3_client, get_s3_settings

    if s3_client is None:
        s3_client = get_s3_client()
    if bucket is None:
        bucket = get_s3_settings().bucket

    result_tracker = BatchTaskResult(len(photos))

    photo_ids = [p["photo_id"] for p in photos]
    existing_ids = _get_existing_photo_ids(photo_ids)

    for photo_data in photos:
        _process_single_photo(photo_data, s3_client, bucket, existing_ids, result_tracker)

    if result_tracker.results:
        _batch_update_photo_results(result_tracker.results, result_tracker)

    logger.info("Batch completion: %s success, %s skipped, %s failed", result_tracker.successful, result_tracker.skipped, result_tracker.failed)
    return result_tracker.to_dict()


@broker.task(task_name="create_thumbnails_batch")
def create_thumbnails_batch_task(
    photos: list[dict],
    s3_client: Any = TASK_S3_DEP,
    task_context: dict[str, Any] = TASK_CONTEXT_DEP,
) -> dict:
    broker_state = task_context.get("broker_state") if task_context else None
    bucket = getattr(broker_state, "s3_bucket", None)
    return create_thumbnails_batch_task_impl(photos, s3_client=s3_client, bucket=bucket)


def delete_photo_data_task_impl(photo_id: str, gallery_id: str, owner_id: str) -> dict:
    photo_uuid = uuid.UUID(photo_id)
    gallery_uuid = uuid.UUID(gallery_id)
    owner_uuid = uuid.UUID(owner_id)

    with task_db_session() as db:
        photo = db.execute(select(Photo.object_key, Photo.thumbnail_object_key, Photo.file_size, Photo.status).where(Photo.id == photo_uuid, Photo.gallery_id == gallery_uuid)).one_or_none()

        if not photo:
            logger.warning("Photo %s not found in gallery %s", photo_id, gallery_id)
            return {"deleted": False, "reason": "Photo not found"}

        object_key, thumbnail_object_key, file_size, status = photo

    from ..s3_utils import get_s3_client, get_s3_settings

    s3_client = get_s3_client()
    bucket = get_s3_settings().bucket

    try:
        s3_client.delete_object(Bucket=bucket, Key=object_key)
    except ClientError as e:
        logger.warning("Failed to delete photo object %s: %s", object_key, e)
        if e.response.get("Error", {}).get("Code") != "NoSuchKey":
            raise

    if thumbnail_object_key and thumbnail_object_key != object_key:
        try:
            s3_client.delete_object(Bucket=bucket, Key=thumbnail_object_key)
        except ClientError as e:
            logger.warning("Failed to delete thumbnail %s: %s", thumbnail_object_key, e)
            if e.response.get("Error", {}).get("Code") != "NoSuchKey":
                raise

    with task_db_session() as db:
        if status == PhotoUploadStatus.SUCCESSFUL:
            db.execute(update(User).where(User.id == owner_uuid).values(storage_used=func.greatest(User.storage_used - file_size, 0)))
        elif status == PhotoUploadStatus.PENDING:
            db.execute(update(User).where(User.id == owner_uuid).values(storage_reserved=func.greatest(User.storage_reserved - file_size, 0)))

        db.execute(delete(Photo).where(Photo.id == photo_uuid))

    logger.info("Deleted photo %s from gallery %s", photo_id, gallery_id)
    return {"deleted": True}


@broker.task(task_name="delete_photo_data")
def delete_photo_data_task(photo_id: str, gallery_id: str, owner_id: str) -> dict:
    return delete_photo_data_task_impl(photo_id, gallery_id, owner_id)
