import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.cache_utils import photo_cache, url_cache
from src.viewport.db import get_db
from src.viewport.minio_utils import generate_presigned_url, upload_fileobj
from src.viewport.repositories.gallery_repository import GalleryRepository
from src.viewport.schemas.photo import PhotoResponse, PhotoUploadResponse, PhotoUploadResult

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])
photo_auth_router = APIRouter(prefix="/photos", tags=["photos"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


# TODO: NEED TO ADD RENAME PHOTO ENDPOINT AND UPDATE FRONTEND TO ACTUALLY USE IT


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


@router.post("/{gallery_id}/photos", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
def upload_photo(gallery_id: UUID, file: UploadFile = File(...), repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):  # noqa: B008
    # Check gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Validate file size
    contents = file.file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")

    # Upload to MinIO
    filename = f"{gallery_id}/{file.filename}"
    # Upload file content and store object key
    object_key = filename
    upload_fileobj(fileobj=bytes(contents), filename=object_key)

    # Save Photo record
    photo = repo.create_photo(gallery_id, object_key, file_size)
    return PhotoResponse.from_db_photo(photo)


@router.post("/{gallery_id}/photos/batch", response_model=PhotoUploadResponse)
def upload_photos_batch(gallery_id: UUID, files: Annotated[list[UploadFile], File()], repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    """Upload multiple photos to a gallery"""
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

    for file in files:
        try:
            # Validate file size
            contents = file.file.read()
            file_size = len(contents)

            if file_size > MAX_FILE_SIZE:
                results.append(PhotoUploadResult(filename=file.filename or "unknown", success=False, error=f"File too large (max 15MB), got {file_size / (1024 * 1024):.1f}MB"))
                failed_uploads += 1
                continue

            # Upload to MinIO
            filename = f"{gallery_id}/{file.filename}"
            object_key = filename
            upload_fileobj(fileobj=bytes(contents), filename=object_key)

            # Save Photo record
            photo = repo.create_photo(gallery_id, object_key, file_size)
            photo_response = PhotoResponse.from_db_photo(photo)

            results.append(PhotoUploadResult(filename=file.filename or "unknown", success=True, photo=photo_response))
            successful_uploads += 1

        except Exception as e:
            results.append(PhotoUploadResult(filename=file.filename or "unknown", success=False, error=str(e)))
            failed_uploads += 1
        finally:
            # Reset file position for next iteration
            file.file.seek(0)

    return PhotoUploadResponse(results=results, total_files=len(files), successful_uploads=successful_uploads, failed_uploads=failed_uploads)


@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    if not repo.delete_photo(photo_id, gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Photo not found")
    return
