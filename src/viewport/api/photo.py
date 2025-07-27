import mimetypes
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.minio_utils import get_minio_config, get_s3_client, upload_fileobj
from src.viewport.models.gallery import Gallery, Photo
from src.viewport.schemas.photo import PhotoResponse

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])


# GET /galleries/{gallery_id}/photos/{photo_id} - View photo for authenticated users
@router.get("/{gallery_id}/photos/{photo_id}")
def get_photo(
    gallery_id: UUID,
    photo_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Stream a photo for authenticated users who own the gallery"""
    # Verify gallery ownership and photo belongs to gallery
    photo = db.query(Photo).join(Photo.gallery).filter(
        Photo.id == photo_id,
        Photo.gallery_id == gallery_id,
        Photo.gallery.has(owner_id=current_user.id)
    ).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Stream photo from S3
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()

    try:
        obj = s3_client.get_object(Bucket=bucket, Key=photo.object_key)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found")

    # Guess MIME type based on file extension
    mime_type, _ = mimetypes.guess_type(photo.object_key)
    if not mime_type:
        mime_type = obj.get("ContentType", "application/octet-stream")

    return StreamingResponse(obj["Body"], media_type=mime_type)


# POST /galleries/{gallery_id}/photos
@router.post("/{gallery_id}/photos", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
def upload_photo(gallery_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Check gallery ownership
    gallery = db.query(Gallery).filter_by(id=gallery_id, owner_id=current_user.id).first()
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
    photo = Photo(gallery_id=gallery_id, object_key=object_key, file_size=file_size)
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return PhotoResponse.from_db_photo(photo)


# DELETE /galleries/{gallery_id}/photos/{photo_id}
@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(gallery_id: UUID, photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Verify gallery ownership and photo belongs to gallery
    photo = db.query(Photo).join(Photo.gallery).filter(
        Photo.id == photo_id,
        Photo.gallery_id == gallery_id,
        Photo.gallery.has(owner_id=current_user.id)
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()
    return
