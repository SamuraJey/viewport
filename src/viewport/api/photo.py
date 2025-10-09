import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.cache_utils import photo_cache, url_cache
from src.viewport.db import get_db
from src.viewport.minio_utils import generate_presigned_url
from src.viewport.repositories.gallery_repository import GalleryRepository
from src.viewport.schemas.photo import PhotoRenameRequest, PhotoResponse, PhotoUploadResponse, PhotoUploadResult

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


# GET /galleries/{gallery_id}/photos/urls - Get all photo URLs for a gallery
@router.get("/{gallery_id}/photos/urls", response_model=list[PhotoResponse])
@photo_cache(max_age=3600, public=False)
def get_all_photo_urls_for_gallery(
    gallery_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
) -> list[PhotoResponse]:
    """Get presigned URLs for all photos in a gallery for the owner."""
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Get all photos for the gallery
    photos = repo.get_photos_by_gallery_id(gallery_id)

    # Generate presigned URLs for each photo
    photo_responses = []
    for photo in photos:
        try:
            photo_responses.append(PhotoResponse.from_db_photo(photo))
        except Exception:
            logger.error("Failed to generate presigned URL for photo %s in gallery %s", photo.id, gallery_id)
            continue

    return photo_responses


# GET /galleries/{gallery_id}/photos/{photo_id} - Get photo info for gallery
@router.get("/{gallery_id}/photos/{photo_id}", response_model=PhotoResponse)
@photo_cache(max_age=3600, public=False)
def get_photo(request: Request, gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    """Get photo information for authenticated users who own the gallery"""
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery
    photo = repo.get_photo_by_id_and_gallery(photo_id, gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    return PhotoResponse.from_db_photo(photo)


# GET /galleries/{gallery_id}/photos/{photo_id}/url - Get presigned URL for photo in gallery
@router.get("/{gallery_id}/photos/{photo_id}/url")
@url_cache(max_age=3600)
def get_photo_url(gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    """Get a presigned URL for a photo for authenticated users who own the gallery"""
    logger.debug("Generating presigned URL for photo %s in gallery %s", photo_id, gallery_id)
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery
    photo = repo.get_photo_by_id_and_gallery(photo_id, gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Generate presigned URL
    try:
        url = generate_presigned_url(photo.object_key, expires_in=3600)  # 1 hour expiration
        return {"url": url, "expires_in": 3600}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate photo URL") from e


@router.post("/{gallery_id}/photos/batch", response_model=PhotoUploadResponse)
async def upload_photos_batch(
    gallery_id: UUID,
    files: Annotated[list[UploadFile], File()],
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user=Depends(get_current_user),
):
    """Upload multiple photos to a gallery with concurrent processing"""
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

    # Semaphore to limit concurrent processing (avoid overwhelming the system)
    # Limit to 25 concurrent file operations (matches connection pool size)
    semaphore = asyncio.Semaphore(25)

    async def process_single_file(file: UploadFile) -> PhotoUploadResult:
        """Process a single file: validate, upload, create thumbnail"""
        async with semaphore:  # Limit concurrent processing
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

                # Process and upload image with thumbnail concurrently
                from src.viewport.minio_utils import async_process_and_upload_image

                _, thumbnail_object_key, width, height = await async_process_and_upload_image(contents, object_key, extract_dimensions=True)

                # Return data for batch DB insert
                return PhotoUploadResult(
                    filename=file.filename or "unknown",
                    success=True,
                    photo=None,  # Will be populated after DB insert
                    metadata_={
                        "object_key": object_key,
                        "thumbnail_object_key": thumbnail_object_key,
                        "file_size": file_size,
                        "width": width,
                        "height": height,
                    },
                )

            except Exception as e:
                logger.error(f"Failed to process file {file.filename}: {e}", exc_info=True)
                return PhotoUploadResult(filename=file.filename or "unknown", success=False, error=str(e))
            finally:
                # Reset file position
                await file.seek(0)

    # Process all files concurrently (with semaphore limiting)
    results = await asyncio.gather(*[process_single_file(file) for file in files])

    # Separate successful and failed uploads
    successful_results = [r for r in results if r.success and r.metadata_ is not None]
    failed_results = [r for r in results if not r.success or r.metadata_ is None]

    logger.info(f"Batch upload complete: {len(successful_results)} successful, {len(failed_results)} failed out of {len(results)} total")

    # Batch insert successful photos into database
    if successful_results:
        photos_data = []
        for result in successful_results:
            metadata = result.metadata_
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

        # Map created photos back to results
        photo_map = {p.object_key: p for p in created_photos}
        for result in successful_results:
            object_key = result.metadata_["object_key"]
            if object_key in photo_map:
                result.photo = PhotoResponse.from_db_photo(photo_map[object_key])

        successful_uploads = len(successful_results)

    failed_uploads = len(failed_results)

    return PhotoUploadResponse(
        results=results,
        total_files=len(files),
        successful_uploads=successful_uploads,
        failed_uploads=failed_uploads,
    )


@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    if not repo.delete_photo(photo_id, gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Photo not found")
    return


@router.patch("/{gallery_id}/photos/{photo_id}/rename", response_model=PhotoResponse)
def rename_photo(gallery_id: UUID, photo_id: UUID, request: PhotoRenameRequest, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)) -> PhotoResponse:
    """Rename a photo in a gallery"""
    # First, verify gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery and rename it
    photo = repo.rename_photo(photo_id, gallery_id, current_user.id, request.filename)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    return PhotoResponse.from_db_photo(photo)
