import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.auth_utils import get_current_user, get_current_user_for_download
from viewport.background_tasks import create_thumbnails_batch_task, delete_photos_batch_task, process_videos_batch_task
from viewport.dependencies import get_s3_client
from viewport.filename_utils import build_content_disposition, resolve_photo_filename, sanitize_filename, split_name_and_ext
from viewport.models.db import get_db
from viewport.models.gallery import MediaType, Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.photo import (
    AbortMultipartUploadRequest,
    BatchConfirmUploadRequest,
    BatchConfirmUploadResponse,
    BatchDeletePhotosRequest,
    BatchDeletePhotosResponse,
    BatchPresignedUploadItem,
    BatchPresignedUploadsRequest,
    BatchPresignedUploadsResponse,
    CompleteMultipartUploadRequest,
    PhotoRenameRequest,
    PhotoResponse,
    PresignedUploadData,
)
from viewport.thumbnail_tasks import ThumbnailTaskItem, to_thumbnail_task_payloads
from viewport.video_metrics import VIDEO_QUEUE_DEPTH

MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
VIDEO_PART_SIZE = 16 * 1024 * 1024  # 16 MiB
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpeg", ".mpg", ".3gp"}
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}

# Pre-computed content type mapping for faster lookups
CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

logger = logging.getLogger(__name__)


def _is_video(filename: str, content_type: str) -> bool:
    """Return True if the file appears to be a video based on extension or MIME type."""
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if f".{ext}" in VIDEO_EXTENSIONS:
            return True
    return content_type.lower().startswith("video/")


def _part_count(file_size: int, part_size: int) -> int:
    """Calculate number of parts for a multipart upload."""
    return (file_size + part_size - 1) // part_size


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


def _enqueue_media_processing(photo: Photo) -> None:
    """Enqueue the appropriate background task based on media type."""
    if photo.media_type == MediaType.VIDEO.value:
        VIDEO_QUEUE_DEPTH.inc()
        process_videos_batch_task.delay([{"photo_id": str(photo.id), "object_key": photo.object_key}])
    else:
        create_thumbnails_batch_task.delay([{"photo_id": str(photo.id), "object_key": photo.object_key}])


@router.post("/{gallery_id}/photos/{photo_id}/download")
async def download_photo(
    gallery_id: UUID,
    photo_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user_for_download),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> RedirectResponse:
    """Redirect an authenticated browser download to an attachment presigned URL.

    Single-photo downloads are intentionally browser-managed instead of
    fetched through JavaScript. Fetching the S3 presigned URL requires the
    storage service to expose CORS headers, while a top-level browser download
    can follow a signed redirect without CORS.
    """
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    photo = await repo.get_photo_by_id_and_gallery(photo_id, gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filename = resolve_photo_filename(photo)
    download_url = await s3_client.generate_presigned_url_async(
        photo.object_key,
        expires_in=7200,
        response_content_disposition=build_content_disposition(
            filename,
            disposition_type="attachment",
        ),
    )
    return RedirectResponse(download_url, status_code=status.HTTP_303_SEE_OTHER)


@router.post("/{gallery_id}/photos/batch-presigned", response_model=BatchPresignedUploadsResponse)
async def batch_presigned_uploads(
    gallery_id: UUID,
    request: BatchPresignedUploadsRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchPresignedUploadsResponse:
    """Generate presigned URLs for batch upload (max 100 files).

    Supports image single-PUT and video multipart uploads in one batch.
    """
    # 1. Check gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(404, "Gallery not found")

    # 2. Classify files and compute total storage to reserve
    bytes_to_reserve = 0
    items: list[BatchPresignedUploadItem] = []
    photos_payload: list[dict] = []
    failed_presign_bytes = 0

    for file_request in request.files:
        content_type = file_request.content_type.lower()
        filename = file_request.filename
        file_size = file_request.file_size

        # Determine media type and validate size limits
        is_video = _is_video(filename, content_type)
        if content_type in IMAGE_CONTENT_TYPES and file_size <= MAX_IMAGE_FILE_SIZE:
            media_type = MediaType.IMAGE
        elif is_video and file_size <= MAX_VIDEO_FILE_SIZE:
            media_type = MediaType.VIDEO
        elif content_type in IMAGE_CONTENT_TYPES and file_size > MAX_IMAGE_FILE_SIZE:
            items.append(
                BatchPresignedUploadItem(
                    filename=filename,
                    file_size=file_size,
                    success=False,
                    error=f"Image exceeds maximum size of {MAX_IMAGE_FILE_SIZE // (1024 * 1024)} MB",
                )
            )
            continue
        elif is_video and file_size > MAX_VIDEO_FILE_SIZE:
            items.append(
                BatchPresignedUploadItem(
                    filename=filename,
                    file_size=file_size,
                    success=False,
                    error=f"Video exceeds maximum size of {MAX_VIDEO_FILE_SIZE // (1024 * 1024)} MB",
                )
            )
            continue
        else:
            items.append(
                BatchPresignedUploadItem(
                    filename=filename,
                    file_size=file_size,
                    success=False,
                    error="Unsupported file type or content type",
                )
            )
            continue

        bytes_to_reserve += file_size

    if bytes_to_reserve > 0:
        reserved = await user_repo.reserve_storage(current_user.id, bytes_to_reserve)
        if not reserved:
            raise HTTPException(status_code=507, detail="Storage quota exceeded")

    reserved_bytes_to_release_on_error = bytes_to_reserve

    try:
        occupied_display_names = await repo.get_photo_display_names_by_gallery(gallery_id)

        # 3. Generate Photo records and presigned URLs
        for file_request in request.files:
            content_type = file_request.content_type.lower()
            filename = file_request.filename
            file_size = file_request.file_size
            is_video = _is_video(filename, content_type)

            # Skip files already marked as failures
            if content_type in IMAGE_CONTENT_TYPES and file_size > MAX_IMAGE_FILE_SIZE:
                continue
            if is_video and file_size > MAX_VIDEO_FILE_SIZE:
                continue
            if not (content_type in IMAGE_CONTENT_TYPES or is_video):
                continue

            photo_id = uuid4()
            display_name = make_unique_display_name(filename, occupied_display_names)
            _, extension = split_name_and_ext(display_name)
            object_key = f"{gallery_id}/{photo_id}{extension.lower()}"
            media_type = MediaType.VIDEO if is_video else MediaType.IMAGE

            if media_type == MediaType.IMAGE:
                # --- Image: single PUT ---
                try:
                    presigned = s3_client.generate_presigned_put(
                        object_key=object_key,
                        content_type=content_type,
                        content_length=file_size,
                        expires_in=900,
                    )
                except Exception as exc:
                    failed_presign_bytes += file_size
                    logger.warning("Failed to generate presigned PUT for %s: %s", object_key, exc)
                    items.append(
                        BatchPresignedUploadItem(
                            filename=filename,
                            file_size=file_size,
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
                        "file_size": file_size,
                        "status": PhotoUploadStatus.PENDING,
                        "media_type": media_type.value,
                        "source_content_type": content_type,
                        "width": None,
                        "height": None,
                    }
                )

                items.append(
                    BatchPresignedUploadItem(
                        filename=display_name,
                        file_size=file_size,
                        success=True,
                        photo_id=photo_id,
                        upload_mode="single",
                        presigned_data=PresignedUploadData(
                            url=presigned["url"],
                            headers=presigned["headers"],
                        ),
                        expires_in=900,
                    )
                )
            else:
                # --- Video: multipart upload ---
                try:
                    upload_id: str = await s3_client.create_multipart_upload(object_key, content_type)
                except Exception as exc:
                    failed_presign_bytes += file_size
                    logger.warning("Failed to create multipart upload for %s: %s", object_key, exc)
                    items.append(
                        BatchPresignedUploadItem(
                            filename=filename,
                            file_size=file_size,
                            success=False,
                            error="Failed to initiate multipart upload",
                        )
                    )
                    continue

                part_count = _part_count(file_size, VIDEO_PART_SIZE)
                presigned_urls: list[str] = []
                part_gen_failed = False
                for part_number in range(1, part_count + 1):
                    part_actual_size = min(VIDEO_PART_SIZE, file_size - (part_number - 1) * VIDEO_PART_SIZE)
                    try:
                        url = s3_client.generate_presigned_upload_part(
                            object_key=object_key,
                            upload_id=upload_id,
                            part_number=part_number,
                            part_size=part_actual_size,
                            expires_in=900,
                        )
                        presigned_urls.append(url)
                    except Exception as exc:
                        failed_presign_bytes += file_size
                        logger.warning(
                            "Failed to generate presigned upload_part URL for %s part %s: %s",
                            object_key,
                            part_number,
                            exc,
                        )
                        # Abort the multipart upload to avoid orphaned S3 state
                        try:
                            await s3_client.abort_multipart_upload(object_key, upload_id)
                        except Exception:
                            logger.warning("Failed to abort multipart upload for %s after part URL generation failure", object_key)
                        items.append(
                            BatchPresignedUploadItem(
                                filename=filename,
                                file_size=file_size,
                                success=False,
                                error="Failed to generate presigned part URLs",
                            )
                        )
                        part_gen_failed = True
                        break

                if part_gen_failed:
                    continue

                photos_payload.append(
                    {
                        "id": photo_id,
                        "gallery_id": gallery_id,
                        "object_key": object_key,
                        "display_name": display_name,
                        "thumbnail_object_key": object_key,
                        "file_size": file_size,
                        "status": PhotoUploadStatus.PENDING,
                        "media_type": media_type.value,
                        "source_content_type": content_type,
                        "multipart_upload_id": upload_id,
                        "width": None,
                        "height": None,
                    }
                )

                items.append(
                    BatchPresignedUploadItem(
                        filename=display_name,
                        file_size=file_size,
                        success=True,
                        photo_id=photo_id,
                        upload_mode="multipart",
                        upload_id=upload_id,
                        part_size=VIDEO_PART_SIZE,
                        presigned_urls=presigned_urls,
                        expected_total_size=file_size,
                        expires_in=900,
                    )
                )

        if failed_presign_bytes > 0:
            await user_repo.release_reserved_storage(current_user.id, failed_presign_bytes)
            reserved_bytes_to_release_on_error -= failed_presign_bytes

        if photos_payload:
            await repo.create_photos_batch(photos_payload)
            reserved_bytes_to_release_on_error = 0
        else:
            reserved_bytes_to_release_on_error = 0
    except Exception:
        if reserved_bytes_to_release_on_error > 0:
            await user_repo.release_reserved_storage(current_user.id, reserved_bytes_to_release_on_error)
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
    Sets status to PROCESSING for confirmed uploads.
    Starts media processing (S3 verification and fallback-to-FAILED happen in background).

    Media processing is queued to Celery after the DB transaction commits.
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

        # Videos must use multipart/complete, not this endpoint
        if photo.media_type == MediaType.VIDEO.value:
            status_updates[photo.id] = PhotoUploadStatus.FAILED
            failed_count += 1
            continue

        if photo.status in (PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.PROCESSING):
            # Idempotent retry path: if metadata/thumbnail are still missing,
            # enqueue background processing again.
            if _photo_needs_thumbnail_processing(photo):
                photos_to_process.append(ThumbnailTaskItem(photo.id, photo.object_key))
            confirmed_count += 1
            continue

        if photo.status != PhotoUploadStatus.PENDING:
            failed_count += 1
            continue

        status_updates[photo.id] = PhotoUploadStatus.PROCESSING
        confirmed_count += 1
        photos_to_process.append(ThumbnailTaskItem(photo.id, photo.object_key))

    bytes_to_finalize = 0
    bytes_to_release = 0
    for photo_id, photo_status in status_updates.items():
        photo = photo_map.get(photo_id)
        if not photo:
            continue
        previous_status = previous_status_map.get(photo_id)
        if photo_status == PhotoUploadStatus.PROCESSING and previous_status == PhotoUploadStatus.PENDING:
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
        object_keys = [key for photo in photos if photo.id in existing_photo_ids_set for key in [photo.object_key, photo.thumbnail_object_key, photo.playback_object_key] if key]
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


@router.post("/{gallery_id}/photos/{photo_id}/multipart/complete", response_model=BatchConfirmUploadResponse)
async def complete_multipart_upload(
    gallery_id: UUID,
    photo_id: UUID,
    request: CompleteMultipartUploadRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchConfirmUploadResponse:
    """Complete a video multipart upload, finalize the S3 object, and enqueue processing."""
    # 1. Verify gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # 2. Fetch photo and validate state
    photo = await repo.get_photo_by_id_and_gallery(photo_id, gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if photo.media_type != MediaType.VIDEO.value:
        raise HTTPException(status_code=400, detail="Multipart complete is only applicable to video uploads")

    if photo.status != PhotoUploadStatus.PENDING:
        raise HTTPException(status_code=409, detail="Photo is not in pending state")

    if not photo.multipart_upload_id or photo.multipart_upload_id != request.upload_id:
        raise HTTPException(status_code=400, detail="Upload ID mismatch")

    # 3. Complete the multipart upload on S3
    try:
        await s3_client.complete_multipart_upload(photo.object_key, request.upload_id, request.parts)
    except Exception as exc:
        logger.warning("Failed to complete multipart upload for %s: %s", photo.object_key, exc)
        raise HTTPException(status_code=502, detail="Failed to complete multipart upload on S3") from exc

    # 4. Update photo status and clear multipart state
    photo.status = PhotoUploadStatus.PROCESSING
    photo.multipart_upload_id = None

    # 5. Finalize quota (move reserved -> used)
    await user_repo.finalize_reserved_storage(current_user.id, photo.file_size, commit=False)
    await repo.db.commit()

    # 6. Enqueue video processing
    try:
        await run_in_threadpool(_enqueue_media_processing, photo)
    except Exception as exc:
        logger.warning(
            "Failed to enqueue video processing task for %s: %s",
            photo.id,
            exc,
            extra={"photo_id": str(photo.id)},
            exc_info=True,
        )
        raise HTTPException(status_code=503, detail="Failed to enqueue video processing task") from exc

    return BatchConfirmUploadResponse(confirmed_count=1, failed_count=0)


@router.post("/{gallery_id}/photos/{photo_id}/multipart/abort", response_model=BatchConfirmUploadResponse)
async def abort_multipart_upload(
    gallery_id: UUID,
    photo_id: UUID,
    request: AbortMultipartUploadRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> BatchConfirmUploadResponse:
    """Abort a video multipart upload, release reserved storage, and delete the photo record."""
    # 1. Verify gallery ownership
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # 2. Fetch photo and validate state
    photo = await repo.get_photo_by_id_and_gallery(photo_id, gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if photo.status != PhotoUploadStatus.PENDING:
        raise HTTPException(status_code=409, detail="Photo is not in pending state")

    if not photo.multipart_upload_id or photo.multipart_upload_id != request.upload_id:
        raise HTTPException(status_code=400, detail="Upload ID mismatch")

    # 3. Abort the multipart upload on S3
    try:
        await s3_client.abort_multipart_upload(photo.object_key, request.upload_id)
    except Exception as exc:
        logger.warning("Failed to abort multipart upload for %s: %s", photo.object_key, exc)
        raise HTTPException(status_code=502, detail="Failed to abort multipart upload on S3") from exc

    # 4. Release reserved storage
    await user_repo.release_reserved_storage(current_user.id, photo.file_size, commit=False)

    # 5. Delete the photo record
    await repo.db.delete(photo)
    await repo.db.commit()

    return BatchConfirmUploadResponse(confirmed_count=1, failed_count=0)
