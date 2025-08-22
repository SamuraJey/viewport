import io
import mimetypes
import zipfile
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.viewport.cache_utils import photo_cache
from src.viewport.db import get_db
from src.viewport.logger import logger
from src.viewport.minio_utils import get_minio_config, get_s3_client
from src.viewport.models.gallery import Gallery, Photo
from src.viewport.models.sharelink import ShareLink
from src.viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto

router = APIRouter(prefix="/s", tags=["public"])


def get_valid_sharelink(share_id: UUID, db: Session = Depends(get_db)) -> ShareLink:
    stmt = select(ShareLink).where(ShareLink.id == share_id)
    sharelink = db.execute(stmt).scalar_one_or_none()
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found")
    if sharelink.expires_at and sharelink.expires_at.timestamp() < datetime.now(UTC).timestamp():
        raise HTTPException(status_code=404, detail="ShareLink expired")
    return sharelink


@router.get("/{share_id}", response_model=PublicGalleryResponse)
def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    sharelink: ShareLink = Depends(get_valid_sharelink),
):
    # Photos
    stmt = select(Photo).where(Photo.gallery_id == sharelink.gallery_id)
    photos = db.execute(stmt).scalars().all()
    photo_list = [
        PublicPhoto(
            photo_id=str(photo.id),
            # Use secure public photo endpoints instead of direct file access
            thumbnail_url=f"/s/{share_id}/photos/{photo.id}",
            full_url=f"/s/{share_id}/photos/{photo.id}",
        )
        for photo in photos
    ]

    # Gallery metadata
    gallery: Gallery = sharelink.gallery  # lazy-loaded
    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = PublicCover(photo_id=cover_id, full_url=f"/s/{share_id}/photos/{cover_id}", thumbnail_url=f"/s/{share_id}/photos/{cover_id}") if cover_id else None
    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    # Format date as DD.MM.YYYY similar to wfolio sample
    dt = getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views
    sharelink.views += 1  # type: ignore
    db.commit()
    logger.log_event("view_gallery", share_id=share_id)
    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
    )


@router.get("/{share_id}/photos/{photo_id}")
@photo_cache(max_age=86400, public=True)
def get_single_photo_by_sharelink(request: Request, share_id: UUID, photo_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == sharelink.gallery_id)
    photo = db.execute(stmt).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    logger.log_event("view_photo", share_id=share_id, extra={"photo_id": str(photo_id)})

    # Stream photo directly from S3
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()

    try:
        obj = s3_client.get_object(Bucket=bucket, Key=photo.object_key)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found") from e

    # Guess MIME type based on file extension
    mime_type, _ = mimetypes.guess_type(photo.object_key)
    logger.warning(f"Guessed MIME type: {mime_type} for {photo.object_key}")
    if not mime_type:
        mime_type = obj.get("ContentType", "application/octet-stream")

    return StreamingResponse(obj["Body"], media_type=mime_type)


@router.get("/{share_id}/download/all")
def download_all_photos_zip(share_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    stmt = select(Photo).where(Photo.gallery_id == sharelink.gallery_id)
    photos = db.execute(stmt).scalars().all()
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")
    zip_buffer = io.BytesIO()
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for photo in photos:
            # Object key is stored directly
            file_key = photo.object_key
            obj = s3_client.get_object(Bucket=bucket, Key=file_key)
            zipf.writestr(file_key, obj["Body"].read())
    zip_buffer.seek(0)
    sharelink.zip_downloads += 1
    db.commit()
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})
    return StreamingResponse(zip_buffer, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=gallery.zip"})


@router.get("/{share_id}/download/{photo_id}")
def download_single_photo(share_id: UUID, photo_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == sharelink.gallery_id)
    photo = db.execute(stmt).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Stream file from S3
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()
    # Use stored object key
    file_key = photo.object_key
    obj = s3_client.get_object(Bucket=bucket, Key=file_key)
    sharelink.single_downloads += 1
    db.commit()
    logger.log_event("download_photo", share_id=share_id, extra={"photo_id": str(photo_id)})
    return StreamingResponse(obj["Body"], media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename={file_key}"})
