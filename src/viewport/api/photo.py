import logging
from uuid import UUID, uuid4

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.auth_utils import get_current_user
from viewport.background_tasks import create_thumbnails_batch_task, delete_photos_batch_task
from viewport.dependencies import get_s3_client
from viewport.filename_utils import sanitize_filename, split_name_and_ext
from viewport.models.db import get_db
from viewport.models.gallery import Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.photo import (
    BatchConfirmUploadRequest,
    BatchConfirmUploadResponse,
    BatchDeletePhotosRequest,
    BatchDeletePhotosResponse,
    BatchPresignedUploadItem,
    BatchPresignedUploadsRequest,
    BatchPresignedUploadsResponse,
    PhotoRenameRequest,
    PhotoResponse,
    PresignedUploadData,
)
from viewport.thumbnail_tasks import ThumbnailTaskItem, to_thumbnail_task_payloads

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Pre-computed content type mapping for faster lookups
CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

router = APIRouter(prefix="/galleries", tags=["photos"])


async def _invalidate_presigned_cache_safely(
    s3_client: AsyncS3Client,
    object_keys: list[str],
    operation: str,
) -> None:
    if not object_keys:
        return

    try:
        await s3_client.clear_presigned_cache_for_object_keys(object_keys)
    except Exception as exc:
        logger.warning(
            "Presigned URL cache invalidation skipped during %s: %s",
            operation,
            exc,
        )


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def make_unique_display_name(filename: str, occupied_names: set[str]) -> str:
    candidate = sanitize_filename(filename)
    stem, suffix = split_name_and_ext(candidate)

    unique_name = candidate
    counter = 1
    while unique_name in occupied_names:
        unique_name = f"{stem} ({counter}){suffix}"
        counter += 1

    occupied_names.add(unique_name)
    return unique_name


def get_content_type_from_filename(filename: str | None) -> str:
    """Fast content type determination using pre-computed mapping"""
    if not filename:
        return "image/jpeg"

    # Extract extension efficiently
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[1].lower()
        return CONTENT_TYPE_MAP.get(ext, "image/jpeg")

    return "image/jpeg"


def _photo_needs_thumbnail_processing(photo: Photo) -> bool:
    return photo.thumbnail_object_key == photo.object_key or photo.width is None or photo.height is None


@router.post("/{gallery_id}/photos/batch-presigned", response_model=BatchPresignedUploadsResponse)
async def batch_presigned_uploads(
    gallery_id: UUID,
    request: BatchPresignedUploadsRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchPresignedUploadsResponse:
    """Generate presigned URLs for batch upload (max 100 files)

    1. Verify gallery ownership
    2. Create Photo records for each file
    3. Generate presigned PUT URLs
    4. Return batch response

    """
    # 1. Check gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(404, "Gallery not found")

    valid_files = [file_request for file_request in request.files if file_request.file_size <= MAX_FILE_SIZE]
    bytes_to_reserve = sum(file_request.file_size for file_request in valid_files)
    if bytes_to_reserve > 0:
        reserved = await user_repo.reserve_storage(current_user.id, bytes_to_reserve)
        if not reserved:
            raise HTTPException(status_code=507, detail="Storage quota exceeded")

    items: list[BatchPresignedUploadItem] = []
    photos_payload: list[dict] = []
    failed_presign_bytes = 0
    occupied_display_names = await repo.get_photo_display_names_by_gallery(gallery_id)

    # 2. Generate Photo records and presigned URLs
    for file_request in request.files:
        if file_request.file_size > MAX_FILE_SIZE:
            items.append(
                BatchPresignedUploadItem(
                    filename=file_request.filename,
                    file_size=file_request.file_size,
                    success=False,
                    error=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB",
                )
            )
            continue

        photo_id = uuid4()
        display_name = make_unique_display_name(file_request.filename, occupied_display_names)
        _, extension = split_name_and_ext(display_name)
        object_key = f"{gallery_id}/{photo_id}{extension.lower()}"

        # Generate presigned PUT signed with exact size and tagging requirements
        try:
            presigned = s3_client.generate_presigned_put(
                object_key=object_key,
                content_type=file_request.content_type,
                content_length=file_request.file_size,
                expires_in=900,
            )
        except ClientError:
            failed_presign_bytes += file_request.file_size
            items.append(
                BatchPresignedUploadItem(
                    filename=file_request.filename,
                    file_size=file_request.file_size,
                    success=False,
                    error="Failed to generate presigned URL",
                )
            )
            continue

        photos_payload.append(
            {
                "id": photo_id,
                "gallery_id": gallery_id,
                "object_key": object_key,
                "display_name": display_name,
                "thumbnail_object_key": object_key,
                "file_size": file_request.file_size,
                "status": PhotoUploadStatus.PENDING,
                "width": None,
                "height": None,
            }
        )

        items.append(
            BatchPresignedUploadItem(
                filename=display_name,
                file_size=file_request.file_size,
                success=True,
                photo_id=photo_id,
                presigned_data=PresignedUploadData(
                    url=presigned["url"],
                    headers=presigned["headers"],
                ),
                expires_in=900,
            )
        )

    if failed_presign_bytes > 0:
        await user_repo.release_reserved_storage(current_user.id, failed_presign_bytes)

    if photos_payload:
        try:
            await repo.create_photos_batch(photos_payload)
        except Exception:
            reserved_for_created = bytes_to_reserve - failed_presign_bytes
            if reserved_for_created > 0:
                await user_repo.release_reserved_storage(current_user.id, reserved_for_created)
            raise

    return BatchPresignedUploadsResponse(items=items)


@router.post("/{gallery_id}/photos/batch-confirm", response_model=BatchConfirmUploadResponse)
async def batch_confirm_uploads(
    gallery_id: UUID,
    request: BatchConfirmUploadRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user: User = Depends(get_current_user),
) -> BatchConfirmUploadResponse:
    """Confirm batch photo uploads to S3

    Process multiple photo confirmations in one request.
    Sets status to THUMBNAIL_CREATING for confirmed uploads.
    Starts thumbnail processing (S3 verification and fallback-to-FAILED happen in background).

    Thumbnail processing is queued to Celery after the DB transaction commits.
    """
    # 1. Verify gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(403, "Access denied")

    # 2. Batch fetch all photos
    photo_ids = [item.photo_id for item in request.items]
    photos = await repo.get_photos_by_ids_and_gallery(gallery_id, photo_ids)
    photo_map = {p.id: p for p in photos}

    confirmed_count = 0
    failed_count = 0
    photos_to_process: list[ThumbnailTaskItem] = []
    status_updates: dict[UUID, PhotoUploadStatus] = {}

    # 3. Process each photo (S3 verification deferred to background task)
    seen_photo_ids: set[UUID] = set()
    previous_status_map: dict[UUID, PhotoUploadStatus] = {}

    for item in request.items:
        if item.photo_id in seen_photo_ids:
            failed_count += 1
            continue

        seen_photo_ids.add(item.photo_id)
        photo = photo_map.get(item.photo_id)
        if not photo:
            failed_count += 1
            continue

        previous_status_map[photo.id] = photo.status

        if not item.success:
            if photo.status == PhotoUploadStatus.PENDING:
                status_updates[photo.id] = PhotoUploadStatus.FAILED
            failed_count += 1
            continue

        if photo.status in (PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING):
            # Idempotent retry path: if metadata/thumbnail are still missing,
            # enqueue background processing again.
            if _photo_needs_thumbnail_processing(photo):
                photos_to_process.append(ThumbnailTaskItem(photo.id, photo.object_key))
            confirmed_count += 1
            continue

        if photo.status != PhotoUploadStatus.PENDING:
            failed_count += 1
            continue

        status_updates[photo.id] = PhotoUploadStatus.THUMBNAIL_CREATING
        confirmed_count += 1
        photos_to_process.append(ThumbnailTaskItem(photo.id, photo.object_key))

    bytes_to_finalize = 0
    bytes_to_release = 0
    for photo_id, photo_status in status_updates.items():
        photo = photo_map.get(photo_id)
        if not photo:
            continue
        previous_status = previous_status_map.get(photo_id)
        if photo_status == PhotoUploadStatus.THUMBNAIL_CREATING and previous_status == PhotoUploadStatus.PENDING:
            bytes_to_finalize += photo.file_size
        elif photo_status == PhotoUploadStatus.FAILED and previous_status == PhotoUploadStatus.PENDING:
            bytes_to_release += photo.file_size

    # 4. Commit statuses and quota updates atomically
    try:
        await repo.set_photos_statuses(photo_map, status_updates, commit=False)
        if bytes_to_finalize or bytes_to_release:
            await user_repo.finalize_and_release_reserved_storage(current_user.id, bytes_to_finalize, bytes_to_release, commit=False)
        await repo.db.commit()
    except Exception:
        await repo.db.rollback()
        raise

    # 5. Start batch thumbnail processing (will retry tagging if needed)
    if photos_to_process:
        thumbnail_payloads = to_thumbnail_task_payloads(photos_to_process)
        try:
            await run_in_threadpool(create_thumbnails_batch_task.delay, thumbnail_payloads)
        except Exception as exc:
            logger.warning(
                "Failed to enqueue thumbnail task",
                extra={"gallery_id": str(gallery_id), "photo_count": len(photos_to_process)},
                exc_info=True,
            )
            # DB state is already committed; return 503 so client can retry confirm
            # and re-enqueue idempotently.
            raise HTTPException(status_code=503, detail="Failed to enqueue thumbnail task") from exc

    return BatchConfirmUploadResponse(confirmed_count=confirmed_count, failed_count=failed_count)


# DELETE /galleries/{gallery_id}/photos - Delete photos in batch (enqueue background tasks)
@router.delete("/{gallery_id}/photos", response_model=BatchDeletePhotosResponse)
async def delete_photos(
    gallery_id: UUID,
    request: BatchDeletePhotosRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchDeletePhotosResponse:
    """Delete photos and enqueue background tasks for S3 cleanup and DB removal.

    Returns batch result immediately after validation and task enqueue attempts.
    Actual S3 deletion happens asynchronously in a Celery worker per photo.
    """
    # Verify gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    photos = await repo.get_photos_by_ids_and_gallery(gallery_id, request.photo_ids)
    photo_map = {photo.id: photo for photo in photos}

    existing_photo_ids = [photo_id for photo_id in request.photo_ids if photo_id in photo_map]
    deleted_ids: list[UUID] = list(existing_photo_ids)
    failed_ids: list[UUID] = []

    if existing_photo_ids:
        existing_photo_ids_set = set(existing_photo_ids)
        object_keys = [key for photo in photos if photo.id in existing_photo_ids_set for key in [photo.object_key, photo.thumbnail_object_key] if key]
        await _invalidate_presigned_cache_safely(s3_client, object_keys, "batch delete")

    if existing_photo_ids:
        try:
            await run_in_threadpool(delete_photos_batch_task.delay, [str(photo_id) for photo_id in existing_photo_ids], str(gallery_id), str(current_user.id))
        except Exception as exc:
            logger.error("Failed to enqueue delete_photos_batch task for gallery %s: %s", gallery_id, exc)
            deleted_ids = []
            failed_ids = list(existing_photo_ids)

    not_found_ids = [photo_id for photo_id in request.photo_ids if photo_id not in photo_map]

    return BatchDeletePhotosResponse(
        requested_count=len(request.photo_ids),
        deleted_ids=deleted_ids,
        not_found_ids=not_found_ids,
        failed_ids=failed_ids,
    )


@router.patch("/{gallery_id}/photos/{photo_id}/rename", response_model=PhotoResponse)
async def rename_photo(
    gallery_id: UUID,
    photo_id: UUID,
    request: PhotoRenameRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> PhotoResponse:
    """Rename a photo in a gallery"""
    # First, verify gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery and rename it
    photo = await repo.rename_photo_async(photo_id, gallery_id, current_user.id, request.filename)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    await _invalidate_presigned_cache_safely(s3_client, [photo.object_key], "rename")
    return await PhotoResponse.from_db_photo(photo, s3_client)
