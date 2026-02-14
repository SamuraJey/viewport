import logging
import re
import time
from uuid import UUID, uuid4

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client
from viewport.models.db import get_db
from viewport.models.gallery import PhotoUploadStatus
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


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def sanitize_filename(filename: str) -> str:
    """Sanitize filename while preserving readability and Cyrillic characters

    Removes path separators and null bytes, replaces spaces with underscores,
    keeps alphanumeric (Latin + Cyrillic), dots, dashes, and underscores.
    """
    if not filename:
        return "file"

    # Remove path separators and null bytes
    filename = filename.replace("\\", "").replace("/", "").replace("\0", "")

    # Replace spaces with underscores
    filename = filename.replace(" ", "_")

    # Keep safe characters: alphanumeric (Latin + Cyrillic), dots, dashes, underscores
    # \u0400-\u04FF covers Cyrillic block (а-я, А-Я, ё, Ё, etc.)
    filename = re.sub(r"[^a-zA-Z0-9._\-а-яА-ЯёЁ]", "", filename)

    # Remove leading/trailing dots and dashes
    filename = filename.strip(".-")

    # Ensure we have a filename
    if not filename:
        filename = "file"

    return filename


def get_content_type_from_filename(filename: str | None) -> str:
    """Fast content type determination using pre-computed mapping"""
    if not filename:
        return "image/jpeg"

    # Extract extension efficiently
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[1].lower()
        return CONTENT_TYPE_MAP.get(ext, "image/jpeg")

    return "image/jpeg"


# GET /galleries/{gallery_id}/photos/urls - Get all photo URLs for a gallery
@router.get("/{gallery_id}/photos/urls", response_model=list[PhotoResponse])
async def get_all_photo_urls_for_gallery(
    gallery_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> list[PhotoResponse]:
    """Get presigned URLs for all photos in a gallery for the owner."""
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Get all photos for the gallery
    photos = repo.get_photos_by_gallery_id(gallery_id)

    photo_responses = await PhotoResponse.from_db_photos_batch(photos, s3_client)

    return photo_responses


@router.post("/{gallery_id}/photos/batch-presigned", response_model=BatchPresignedUploadsResponse)
async def batch_presigned_uploads(
    gallery_id: UUID,
    request: BatchPresignedUploadsRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchPresignedUploadsResponse:
    """Generate presigned URLs for batch upload (max 100 files)

    1. Verify gallery ownership
    2. Create Photo records for each file
    3. Generate presigned PUT URLs
    4. Return batch response
    """
    # 1. Check gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(404, "Gallery not found")

    valid_files = [file_request for file_request in request.files if file_request.file_size <= MAX_FILE_SIZE]
    bytes_to_reserve = sum(file_request.file_size for file_request in valid_files)
    if bytes_to_reserve > 0 and not user_repo.reserve_storage(current_user.id, bytes_to_reserve):
        raise HTTPException(status_code=507, detail="Storage quota exceeded")

    items: list[BatchPresignedUploadItem] = []
    photos_payload: list[dict] = []
    failed_presign_bytes = 0

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

        timestamp = int(time.time() * 1000)
        safe_filename = sanitize_filename(file_request.filename)
        object_key = f"{gallery_id}/{timestamp}_{safe_filename}"
        photo_id = uuid4()

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
                "thumbnail_object_key": object_key,
                "file_size": file_request.file_size,
                "status": PhotoUploadStatus.PENDING,
                "width": None,
                "height": None,
            }
        )

        items.append(
            BatchPresignedUploadItem(
                filename=file_request.filename,
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
        user_repo.release_reserved_storage(current_user.id, failed_presign_bytes)

    if photos_payload:
        try:
            repo.create_photos_batch(photos_payload)
        except Exception:
            reserved_for_created = bytes_to_reserve - failed_presign_bytes
            if reserved_for_created > 0:
                user_repo.release_reserved_storage(current_user.id, reserved_for_created)
            raise

    return BatchPresignedUploadsResponse(items=items)


@router.post("/{gallery_id}/photos/batch-confirm", response_model=BatchConfirmUploadResponse)
async def batch_confirm_uploads(
    gallery_id: UUID,
    request: BatchConfirmUploadRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchConfirmUploadResponse:
    """Confirm batch photo uploads to S3

    Process multiple photo confirmations in one request.
    Sets status to SUCCESSFUL for confirmed uploads.
    Starts thumbnail processing (S3 verification and fallback-to-FAILED happen in background).
    """
    # 1. Verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(403, "Access denied")

    # 2. Batch fetch all photos
    photo_ids = [item.photo_id for item in request.items]
    photos = repo.get_photos_by_ids_and_gallery(gallery_id, photo_ids)
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
        repo.set_photos_statuses(photo_map, status_updates, commit=False)
        if bytes_to_finalize:
            user_repo.finalize_reserved_storage(current_user.id, bytes_to_finalize, commit=False)
        if bytes_to_release:
            user_repo.release_reserved_storage(current_user.id, bytes_to_release, commit=False)
        repo.db.commit()
    except Exception:
        repo.db.rollback()
        raise

    # 5. Start batch thumbnail processing (will retry tagging if needed)
    if photos_to_process:
        from viewport.background_tasks import create_thumbnails_batch_task

        try:
            create_thumbnails_batch_task.delay(photos_to_process)
        except Exception as exc:
            # Statuses are already committed; periodic reconciler will requeue.
            logger.warning(
                "Failed to enqueue thumbnail task for gallery %s (%s photos): %s",
                gallery_id,
                len(photos_to_process),
                exc,
            )

    return BatchConfirmUploadResponse(confirmed_count=confirmed_count, failed_count=failed_count)


@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    gallery_id: UUID,
    photo_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
):
    if not await repo.delete_photo_async(photo_id, gallery_id, current_user.id, s3_client):
        raise HTTPException(status_code=404, detail="Photo not found")
    return


@router.patch("/{gallery_id}/photos/{photo_id}/rename", response_model=PhotoResponse)
async def rename_photo(
    gallery_id: UUID,
    photo_id: UUID,
    request: PhotoRenameRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> PhotoResponse:
    """Rename a photo in a gallery"""
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery and rename it
    photo = await repo.rename_photo_async(photo_id, gallery_id, current_user.id, request.filename, s3_client)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    return PhotoResponse.from_db_photo(photo, s3_client)
