import mimetypes
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.minio_utils import get_minio_config, get_s3_client, upload_fileobj
from src.viewport.models.gallery import Gallery, Photo
from src.viewport.schemas.photo import PhotoResponse

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])
photo_auth_router = APIRouter(prefix="/photos", tags=["photos"])


# GET /galleries/{gallery_id}/photos/{photo_id} - View photo for authenticated users
@router.get("/{gallery_id}/photos/{photo_id}")
def get_photo(gallery_id: UUID, photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Stream a photo for authenticated users who own the gallery"""
    # First, verify gallery ownership
    gallery_stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == current_user.id)
    gallery = db.execute(gallery_stmt).scalar_one_or_none()

    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Then, verify photo belongs to that gallery
    photo_stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == gallery_id)
    photo = db.execute(photo_stmt).scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Stream photo from S3
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()

    try:
        obj = s3_client.get_object(Bucket=bucket, Key=photo.object_key)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found") from e

    # Guess MIME type based on file extension
    mime_type, _ = mimetypes.guess_type(photo.object_key)
    if not mime_type:
        mime_type = obj.get("ContentType", "application/octet-stream")

    # Add caching headers for better performance
    headers = {
        "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        "ETag": f'"{photo.id}"',  # Use photo ID as ETag for cache validation
    }

    return StreamingResponse(obj["Body"], media_type=mime_type, headers=headers)


# GET /photos/auth/{photo_id} - Alternative endpoint with token-based auth for caching
@photo_auth_router.get("/auth/{photo_id}")
def get_photo_with_token(photo_id: UUID, token: str, db: Session = Depends(get_db)):
    """Stream a photo using a temporary access token for better caching"""
    try:
        # Decode the token to get user_id and photo_id
        import jwt

        from src.viewport.api.auth import JWT_ALGORITHM, JWT_SECRET

        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        token_photo_id = payload.get("photo_id")

        # Verify the photo_id in token matches the requested photo
        if str(photo_id) != token_photo_id:
            raise HTTPException(status_code=403, detail="Invalid token for this photo")

        # Get the photo and verify user ownership
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == user_id)
        photo = db.execute(stmt).scalar_one_or_none()

        if not photo:
            raise HTTPException(status_code=404, detail="Photo not found")

        # Stream photo from S3
        _, _, _, bucket = get_minio_config()
        s3_client = get_s3_client()

        try:
            obj = s3_client.get_object(Bucket=bucket, Key=photo.object_key)
        except Exception as e:
            raise HTTPException(status_code=404, detail="File not found") from e

        # Guess MIME type based on file extension
        mime_type, _ = mimetypes.guess_type(photo.object_key)
        if not mime_type:
            mime_type = obj.get("ContentType", "application/octet-stream")

        # Add aggressive caching headers since we're using tokens
        headers = {
            "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
            "ETag": f'"{photo.id}"',
        }

        return StreamingResponse(obj["Body"], media_type=mime_type, headers=headers)

    except jwt.InvalidTokenError:
        raise HTTPException(status_code=403, detail="Invalid or expired token") from None


@router.post("/{gallery_id}/photos", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
def upload_photo(gallery_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):  # noqa: B008
    # Check gallery ownership
    stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == current_user.id)
    gallery = db.execute(stmt).scalar_one_or_none()
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


@router.delete("/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(gallery_id: UUID, photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Verify gallery ownership and photo belongs to gallery
    stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Photo.gallery_id == gallery_id, Gallery.owner_id == current_user.id)
    photo = db.execute(stmt).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()
    return
