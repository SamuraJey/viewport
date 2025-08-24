import mimetypes
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.viewport.api.auth import authsettings
from src.viewport.auth_utils import get_current_user
from src.viewport.cache_utils import photo_cache
from src.viewport.db import get_db
from src.viewport.minio_utils import get_minio_config, get_s3_client, upload_fileobj
from src.viewport.models.gallery import Gallery, Photo
from src.viewport.schemas.photo import PhotoResponse

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries", tags=["photos"])
photo_auth_router = APIRouter(prefix="/photos", tags=["photos"])


# GET /galleries/{gallery_id}/photos/{photo_id} - View photo for authenticated users
@router.get("/{gallery_id}/photos/{photo_id}")
@photo_cache(max_age=3600, public=False)
def get_photo(request: Request, gallery_id: UUID, photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
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

    return StreamingResponse(obj["Body"], media_type=mime_type)


@photo_auth_router.get("/auth/{photo_id}")
@photo_cache(max_age=86400, public=False)
def get_photo_with_token(request: Request, photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Stream a photo for authenticated users with caching"""
    # Get the photo and verify user ownership
    stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == current_user.id)
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

    return StreamingResponse(obj["Body"], media_type=mime_type)


@photo_auth_router.post("/auth/{photo_id}/url")
def get_photo_signed_url(photo_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Get a temporary signed URL for a photo that can be used in img tags"""

    # Verify user owns the photo
    stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == current_user.id)
    photo = db.execute(stmt).scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Create a temporary token valid for 1 hour
    payload = {"photo_id": str(photo_id), "user_id": str(current_user.id), "exp": datetime.now(UTC) + timedelta(hours=1), "type": "photo_access"}
    token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)

    return {"url": f"/photos/temp/{photo_id}?token={token}"}


@photo_auth_router.get("/temp/{photo_id}")
@photo_cache(max_age=3600, public=False)  # Cache for 1 hour
def get_photo_with_temp_token(request: Request, photo_id: UUID, token: str, db: Session = Depends(get_db)):
    """Stream a photo using a temporary token that can be used in img tags"""
    try:
        # Decode and validate the token
        payload = jwt.decode(token, authsettings.jwt_secret_key, algorithms=[authsettings.jwt_algorithm])

        if payload.get("type") != "photo_access":
            raise HTTPException(status_code=403, detail="Invalid token type")

        if payload.get("photo_id") != str(photo_id):
            raise HTTPException(status_code=403, detail="Token photo mismatch")

        user_id = payload.get("user_id")

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

        return StreamingResponse(obj["Body"], media_type=mime_type)

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
