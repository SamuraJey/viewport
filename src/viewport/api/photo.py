import logging
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client
from viewport.models.db import get_db
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.photo import PhotoRenameRequest, PhotoResponse, PhotoUploadResponse, PhotoUploadResult

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


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


@router.post("/{gallery_id}/photos/batch", response_model=PhotoUploadResponse)
async def upload_photos_batch(
    gallery_id: UUID,
    files: Annotated[list[UploadFile], File()],
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
):
    """Upload multiple photos to a gallery - fast upload, deferred thumbnail generation"""
    import asyncio

    # Check gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    if not files:
        logger.warning("No files provided in batch upload")
        raise HTTPException(status_code=400, detail="No files provided")

    results = []
    successful_uploads = 0
    failed_uploads = 0

    # Semaphore to limit concurrent uploads to S3
    semaphore = asyncio.Semaphore(10)

    async def process_single_file(file: UploadFile) -> PhotoUploadResult:
        """Process a single file: validate and upload original to S3"""
        async with semaphore:
            try:
                # Read file contents
                contents = await file.read()
                file_size = len(contents)

                # Validate file size
                if file_size > MAX_FILE_SIZE:
                    return PhotoUploadResult(
                        filename=file.filename or "unknown",
                        success=False,
                        error=f"File too large (max 15MB), got {file_size / (1024 * 1024):.1f}MB",
                    )

                # Generate object key
                object_key = f"{gallery_id}/{file.filename}"

                # Determine content type from filename or default to image/jpeg
                content_type = file.content_type or "image/jpeg"
                if content_type.startswith("image/") and file.filename:
                    # Normalize image content types
                    if "jpg" in file.filename.lower() or "jpeg" in file.filename.lower():
                        content_type = "image/jpeg"
                    elif "png" in file.filename.lower():
                        content_type = "image/png"
                    elif "webp" in file.filename.lower():
                        content_type = "image/webp"

                # Upload only the original image to S3 (no thumbnail yet)
                await s3_client.upload_fileobj(contents, object_key, content_type=content_type)

                # Return data for batch DB insert (thumbnail will be created later)
                return PhotoUploadResult(
                    filename=file.filename or "unknown",
                    success=True,
                    photo=None,  # Will be populated after DB insert
                    metadata_={
                        "object_key": object_key,
                        "thumbnail_object_key": object_key,  # Use original as placeholder
                        "file_size": file_size,
                        "width": None,
                        "height": None,
                    },
                )

            except Exception as e:
                logger.error(f"Failed to upload file {file.filename}: {e}", exc_info=True)
                return PhotoUploadResult(filename=file.filename or "unknown", success=False, error=str(e))
            finally:
                # Reset file position and free memory
                await file.seek(0)
                del contents

    # Process all files concurrently (with semaphore limiting)
    results = await asyncio.gather(*[process_single_file(file) for file in files])

    # Separate successful and failed uploads
    successful_results = [r for r in results if r.success and r.metadata_ is not None]
    failed_results = [r for r in results if not r.success or r.metadata_ is None]

    logger.info(f"Batch upload complete: {len(successful_results)} successful, {len(failed_results)} failed out of {len(results)} total")

    # Batch insert successful photos into database
    if successful_results:
        batch_insert_start = time.time()
        logger.info(f"Starting database batch insert for {len(successful_results)} photos")

        photos_data = []
        for result in successful_results:
            metadata = result.metadata_
            assert metadata is not None  # Since successful_results are filtered
            photos_data.append(
                {
                    "gallery_id": gallery_id,
                    "object_key": metadata["object_key"],
                    "thumbnail_object_key": metadata["thumbnail_object_key"],
                    "file_size": metadata["file_size"],
                    "width": metadata["width"],
                    "height": metadata["height"],
                }
            )

        # Batch insert into database
        created_photos = repo.create_photos_batch(photos_data)

        batch_insert_duration = time.time() - batch_insert_start
        logger.info(f"Database batch insert completed in {batch_insert_duration:.2f}s")

        # Schedule background tasks for thumbnail creation in batches
        from viewport.background_tasks import create_thumbnails_batch_task

        celery_schedule_start = time.time()

        # Group photos into batches of 5 for memory-efficient processing
        # (reduced from 10 to avoid OOM in Celery workers)
        batch_size = 10
        scheduled_batches = 0
        failed_count = 0

        # Prepare photo data for Celery tasks
        photos_for_celery = [{"object_key": photo.object_key, "photo_id": str(photo.id)} for photo in created_photos]

        # Split into batches and schedule
        for i in range(0, len(photos_for_celery), batch_size):
            batch = photos_for_celery[i : i + batch_size]
            try:
                # Fire-and-forget: don't wait for result, don't track result
                create_thumbnails_batch_task.apply_async(
                    args=(batch,),
                    ignore_result=True,  # Don't store result in backend (faster)
                    retry=False,  # Don't retry on connection errors (let task retry itself)
                )
                scheduled_batches += 1
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to schedule batch task: {e}")

        celery_schedule_duration = time.time() - celery_schedule_start
        logger.info(f"Scheduled {scheduled_batches} batch tasks ({len(photos_for_celery)} photos in batches of {batch_size}) in {celery_schedule_duration:.2f}s ({failed_count} failed)")

        photo_responses = await PhotoResponse.from_db_photos_batch(created_photos, s3_client)

        # Map responses back to results by object_key
        response_map = {photo.filename: photo for photo in photo_responses}
        for result in successful_results:
            metadata = result.metadata_
            assert metadata is not None
            # Extract filename from object_key (format: gallery_id/filename)
            filename = metadata["object_key"].split("/", 1)[1] if "/" in metadata["object_key"] else metadata["object_key"]
            if filename in response_map:
                result.photo = response_map[filename]

        successful_uploads = len(successful_results)

    failed_uploads = len(failed_results)

    return PhotoUploadResponse(
        results=results,
        total_files=len(files),
        successful_uploads=successful_uploads,
        failed_uploads=failed_uploads,
    )


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
