from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.cache_utils import url_cache
from src.viewport.db import get_db
from src.viewport.minio_utils import generate_presigned_url, upload_fileobj
from src.viewport.repositories.gallery_repository import GalleryRepository
from src.viewport.schemas.photo import PhotoResponse

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])
photo_auth_router = APIRouter(prefix="/photos", tags=["photos"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


# GET /galleries/{gallery_id}/photos/{photo_id}/url - Get presigned URL for photo in gallery
@router.get("/{gallery_id}/photos/{photo_id}/url")
@url_cache(max_age=3600)
def get_photo_url(gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    """Get a presigned URL for a photo for authenticated users who own the gallery"""
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


# GET /photos/auth/{photo_id}/url - Get presigned URL for direct photo access
@photo_auth_router.get("/auth/{photo_id}/url")
@url_cache(max_age=3600)
def get_photo_url_auth(photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    """Get a presigned URL for a photo for authenticated users with direct access"""
    # Get the photo and verify user ownership
    photo = repo.get_photo_by_id_and_owner(photo_id, current_user.id)

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


@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(gallery_id: UUID, photo_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), current_user=Depends(get_current_user)):
    if not repo.delete_photo(photo_id, gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Photo not found")
    return
