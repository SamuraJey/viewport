import logging
from pathlib import Path
from uuid import UUID, uuid4

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client
from viewport.filename_utils import sanitize_filename
from viewport.models.db import get_db
from viewport.models.gallery import PhotoUploadStatus
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.photo import (
    BatchConfirmUploadRequest,
    BatchConfirmUploadResponse,
    BatchPresignedUploadItem,
    BatchPresignedUploadsRequest,
    BatchPresignedUploadsResponse,
    PhotoRenameRequest,
    PhotoResponse,
    PresignedUploadData,
)

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Pre-computed content type mapping for faster lookups
CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

router = APIRouter(prefix="/galleries", tags=["photos"])


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def split_name_and_ext(filename: str) -> tuple[str, str]:
    path = Path(filename)
    suffix = path.suffix if path.suffix else ""
    stem = path.stem if path.stem else "file"
    return stem, suffix


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
    Sets status to SUCCESSFUL for confirmed uploads.
    Starts thumbnail processing (S3 verification and fallback-to-FAILED happen in background).

    NOTE: Sync endpoint - FastAPI handles threadpool automatically.
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
    photos_to_process = []
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

        if photo.status == PhotoUploadStatus.SUCCESSFUL:
            # Idempotent retry path: if metadata/thumbnail are still missing,
            # enqueue background processing again.
            if photo.thumbnail_object_key == photo.object_key or photo.width is None or photo.height is None:
                photos_to_process.append({"photo_id": str(photo.id), "object_key": photo.object_key})
            confirmed_count += 1
            continue

        if photo.status != PhotoUploadStatus.PENDING:
            failed_count += 1
            continue

        status_updates[photo.id] = PhotoUploadStatus.SUCCESSFUL
        confirmed_count += 1
        # TODO find all places where we use dicts like this, and replace it with DTOs.
        photos_to_process.append({"photo_id": str(photo.id), "object_key": photo.object_key})

    bytes_to_finalize = 0
    bytes_to_release = 0
    for photo_id, photo_status in status_updates.items():
        photo = photo_map.get(photo_id)
        if not photo:
            continue
        previous_status = previous_status_map.get(photo_id)
        if photo_status == PhotoUploadStatus.SUCCESSFUL and previous_status == PhotoUploadStatus.PENDING:
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
        from viewport.background_tasks import create_thumbnails_batch_task

        try:
            await create_thumbnails_batch_task.kiq(photos_to_process)
        except Exception as exc:
            # Statuses are already committed; periodic reconciler will requeue.
            logger.warning(
                "Failed to enqueue thumbnail task for gallery %s (%s photos): %s",
                gallery_id,
                len(photos_to_process),
                exc,
            )

    return BatchConfirmUploadResponse(confirmed_count=confirmed_count, failed_count=failed_count)


# DELETE /galleries/{gallery_id}/photos/{photo_id} - Delete a photo (enqueue background task)
@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    gallery_id: UUID,
    photo_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a photo and enqueue background task for S3 cleanup and DB removal.

    Returns 204 immediately after validation and task enqueue.
    Actual S3 deletion happens asynchronously in Taskiq worker.
    """
    # Verify gallery ownership and photo exists
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    photo = await repo.get_photo_by_id_and_owner(photo_id, current_user.id)
    if not photo or photo.gallery_id != gallery_id:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Enqueue async deletion task
    from viewport.background_tasks import delete_photo_data_task

    try:
        await delete_photo_data_task.kiq(str(photo_id), str(gallery_id), str(current_user.id))
    except Exception as exc:
        logger.error("Failed to enqueue delete_photo_data task for photo %s: %s", photo_id, exc)
        raise HTTPException(status_code=500, detail="Failed to enqueue deletion task") from exc

    return


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
    # TODO do we really need to fetch the photo again here? we already have it in the repo.rename_photo_async method, we can just return it from there instead of fetching it again. this would save us
    # one db call and one s3 call, since we can generate the presigned url in the rename_photo_async method as well. let's refactor that method to return the renamed photo with the new presigned url,
    # and then we can just return it here without fetching it again.
    return await PhotoResponse.from_db_photo(photo, s3_client)
