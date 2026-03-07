import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import delete, func, or_, select, update
from taskiq import TaskiqDepends

from viewport.dependencies import get_task_context, get_task_s3_client
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.user import User
from viewport.s3_service import AsyncS3Client
from viewport.task_utils import task_db_session
from viewport.tasks.photo_tasks import create_thumbnails_batch_task
from viewport.tkq import broker

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    pass


TASK_S3_DEP = TaskiqDepends(get_task_s3_client)
TASK_CONTEXT_DEP = TaskiqDepends(get_task_context)


async def _release_reserved_for_photos(db, photo_ids: list[str]) -> None:
    if not photo_ids:
        return

    stmt = (
        select(Gallery.owner_id, func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Gallery, Photo.gallery_id == Gallery.id).where(Photo.id.in_(photo_ids)).group_by(Gallery.owner_id)
    )
    for owner_id, total in (await db.execute(stmt)).all():
        await db.execute(update(User).where(User.id == owner_id).values(storage_reserved=func.greatest(User.storage_reserved - total, 0)))


async def cleanup_orphaned_uploads_task_impl(s3_client: AsyncS3Client | None = None, bucket: str | None = None) -> dict:
    threshold = datetime.now(UTC) - timedelta(minutes=30)
    logger.info("Starting orphaned uploads cleanup (threshold: %s)", threshold)

    from viewport.dependencies import get_s3_client_instance
    from viewport.s3_utils import get_s3_settings

    if s3_client is None:
        s3_client = get_s3_client_instance()
    if bucket is None:
        bucket = get_s3_settings().bucket
    batch_size = 250
    total_deleted = 0

    while True:
        async with task_db_session() as db:
            stmt = (
                select(Photo)
                .where(
                    Photo.status.in_([PhotoUploadStatus.PENDING, PhotoUploadStatus.FAILED]),
                    Photo.uploaded_at < threshold,
                )
                .order_by(Photo.uploaded_at)
                .limit(batch_size)
            )
            chunk = (await db.execute(stmt)).scalars().all()
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

            pending_ids = [str(p.id) for p in chunk if p.status == PhotoUploadStatus.PENDING]

            if object_keys:
                deleted_count = await s3_client.delete_objects(object_keys)
                logger.info("Deleted %s objects from S3", deleted_count)

            await _release_reserved_for_photos(db, pending_ids)
            delete_stmt = delete(Photo).where(Photo.id.in_(photo_ids))
            await db.execute(delete_stmt)

        total_deleted += len(photo_ids)

    logger.info("Cleaned up %s orphaned photo records", total_deleted)
    return {"deleted_count": total_deleted}


@broker.task(task_name="cleanup_orphaned_uploads", schedule=[{"cron": "0 * * * *", "schedule_id": "cleanup-orphaned-uploads-every-hour"}])
async def cleanup_orphaned_uploads_task(
    s3_client=TASK_S3_DEP,
    task_context: dict = TASK_CONTEXT_DEP,
) -> dict:
    broker_state = task_context.get("broker_state") if task_context else None
    bucket = getattr(broker_state, "s3_bucket", None)
    return await cleanup_orphaned_uploads_task_impl(s3_client=s3_client, bucket=bucket)


async def delete_gallery_data_task_impl(gallery_id: str, s3_client: AsyncS3Client | None = None, bucket: str | None = None) -> dict:
    from viewport.dependencies import get_s3_client_instance
    from viewport.s3_utils import get_s3_settings

    if s3_client is None:
        s3_client = get_s3_client_instance()
    if bucket is None:
        bucket = get_s3_settings().bucket
    prefix = f"{gallery_id}/"

    object_keys = await s3_client.list_object_keys(prefix)
    deleted_objects = await s3_client.delete_objects(object_keys)

    gallery_uuid = uuid.UUID(gallery_id)

    async with task_db_session() as db:
        owner_row = (await db.execute(select(Gallery.owner_id).where(Gallery.id == gallery_uuid))).one_or_none()
        if owner_row:
            owner_id = owner_row[0]
            used_bytes = (
                await db.execute(
                    select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                        Photo.gallery_id == gallery_uuid,
                        Photo.status == PhotoUploadStatus.SUCCESSFUL,
                    )
                )
            ).scalar_one()
            reserved_bytes = (
                await db.execute(
                    select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                        Photo.gallery_id == gallery_uuid,
                        Photo.status == PhotoUploadStatus.PENDING,
                    )
                )
            ).scalar_one()
            await db.execute(update(User).where(User.id == owner_id).values(storage_used=func.greatest(User.storage_used - used_bytes, 0)))
            await db.execute(update(User).where(User.id == owner_id).values(storage_reserved=func.greatest(User.storage_reserved - reserved_bytes, 0)))
        await db.execute(delete(Photo).where(Photo.gallery_id == gallery_uuid))
        await db.execute(delete(ShareLink).where(ShareLink.gallery_id == gallery_uuid))
        await db.execute(delete(Gallery).where(Gallery.id == gallery_uuid))

    logger.info("Deleted gallery %s: %s S3 objects removed", gallery_id, deleted_objects)
    return {"deleted_objects": deleted_objects}


@broker.task(task_name="delete_gallery_data")
async def delete_gallery_data_task(
    gallery_id: str,
    s3_client=TASK_S3_DEP,
    task_context: dict = TASK_CONTEXT_DEP,
) -> dict:
    broker_state = task_context.get("broker_state") if task_context else None
    bucket = getattr(broker_state, "s3_bucket", None)
    return await delete_gallery_data_task_impl(gallery_id, s3_client=s3_client, bucket=bucket)


async def reconcile_storage_quotas_task_impl() -> dict:
    reconciled_users = 0
    updated_users = 0

    async with task_db_session() as db:
        usage_rows = (
            await db.execute(
                select(
                    Gallery.owner_id,
                    Photo.status,
                    func.coalesce(func.sum(Photo.file_size), 0),
                )
                .select_from(Photo)
                .join(Gallery, Photo.gallery_id == Gallery.id)
                .where(Gallery.is_deleted.is_(False), Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.PENDING]))
                .group_by(Gallery.owner_id, Photo.status)
            )
        ).all()

        used_by_user: dict[uuid.UUID, int] = {}
        reserved_by_user: dict[uuid.UUID, int] = {}

        for owner_id, status, total_size in usage_rows:
            if status == PhotoUploadStatus.SUCCESSFUL:
                used_by_user[owner_id] = used_by_user.get(owner_id, 0) + total_size
            elif status == PhotoUploadStatus.PENDING:
                reserved_by_user[owner_id] = reserved_by_user.get(owner_id, 0) + total_size

        owner_ids = set(used_by_user) | set(reserved_by_user)
        users = (
            (
                await db.execute(
                    select(User).where(
                        or_(
                            User.id.in_(owner_ids),
                            User.storage_used != 0,
                            User.storage_reserved != 0,
                        )
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

        await db.commit()

    return {"reconciled_users": reconciled_users, "updated_users": updated_users}


@broker.task(task_name="reconcile_storage_quotas", schedule=[{"cron": "0 3 * * *", "schedule_id": "reconcile-storage-quotas-daily"}])
async def reconcile_storage_quotas_task() -> dict:
    return await reconcile_storage_quotas_task_impl()


async def reconcile_successful_uploads_task_impl() -> dict:
    threshold = datetime.now(UTC) - timedelta(minutes=5)
    max_batch = 500

    async with task_db_session() as db:
        stmt = (
            select(Photo.id, Photo.object_key)
            .join(Photo.gallery)
            .where(
                Photo.status == PhotoUploadStatus.SUCCESSFUL,
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
        rows = (await db.execute(stmt)).all()

    if not rows:
        return {"requeued_count": 0}

    photos = [{"photo_id": str(row[0]), "object_key": row[1]} for row in rows]
    await create_thumbnails_batch_task.kiq(photos)
    logger.info("Requeued %s successful uploads missing thumbnails/metadata", len(photos))
    return {"requeued_count": len(photos)}


@broker.task(task_name="reconcile_successful_uploads", schedule=[{"cron": "*/10 * * * *", "schedule_id": "reconcile-successful-uploads-every-10-min"}])
async def reconcile_successful_uploads_task() -> dict:
    return await reconcile_successful_uploads_task_impl()
