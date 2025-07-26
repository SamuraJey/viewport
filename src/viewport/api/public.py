import io
import zipfile
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session

from src.viewport.db import get_db
from src.viewport.logger import logger
from src.viewport.minio_utils import MINIO_BUCKET, s3_client
from src.viewport.models.gallery import Photo
from src.viewport.models.sharelink import ShareLink

router = APIRouter(prefix="/s", tags=["public"])


def get_valid_sharelink(share_id: UUID, db: Session = Depends(get_db)) -> ShareLink:
    sharelink = db.query(ShareLink).filter(ShareLink.id == share_id).first()
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found")
    if sharelink.expires_at and sharelink.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="ShareLink expired")
    return sharelink


@router.get("/{share_id}")
def get_photos_by_sharelink(share_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photos = db.query(Photo).filter(Photo.gallery_id == sharelink.gallery_id).all()
    result = [
        {
            "photo_id": str(photo.id),
            "thumbnail_url": photo.url_s3,  # TODO: add real thumbnail logic
            "full_url": photo.url_s3,
        }
        for photo in photos
    ]
    # Increment views
    sharelink.views += 1
    db.commit()
    logger.log_event("view_gallery", share_id=share_id)
    return {"photos": result}


@router.get("/{share_id}/photos/{photo_id}")
def get_single_photo_by_sharelink(share_id: UUID, photo_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photo = db.query(Photo).filter(Photo.id == photo_id, Photo.gallery_id == sharelink.gallery_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    logger.log_event("redirect_photo", share_id=share_id, extra={"photo_id": str(photo_id)})
    return RedirectResponse(photo.url_s3)


@router.get("/{share_id}/download/all")
def download_all_photos_zip(
    share_id: UUID,
    db: Session = Depends(get_db),
    sharelink: ShareLink = Depends(get_valid_sharelink)
):
    photos = db.query(Photo).filter(Photo.gallery_id == sharelink.gallery_id).all()
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for photo in photos:
            file_key = photo.url_s3.split(f"/{MINIO_BUCKET}/")[-1].split("?")[0]
            obj = s3_client.get_object(Bucket=MINIO_BUCKET, Key=file_key)
            zipf.writestr(file_key, obj["Body"].read())
    zip_buffer.seek(0)
    sharelink.zip_downloads += 1
    db.commit()
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})
    return StreamingResponse(zip_buffer, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=gallery.zip"})


@router.get("/{share_id}/download/{photo_id}")
def download_single_photo(share_id: UUID, photo_id: UUID, db: Session = Depends(get_db), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photo = db.query(Photo).filter(Photo.id == photo_id, Photo.gallery_id == sharelink.gallery_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Stream file from S3
    file_key = photo.url_s3.split(f"/{MINIO_BUCKET}/")[-1]
    obj = s3_client.get_object(Bucket=MINIO_BUCKET, Key=file_key)
    sharelink.single_downloads += 1
    db.commit()
    logger.log_event("download_photo", share_id=share_id, extra={"photo_id": str(photo_id)})
    return StreamingResponse(obj["Body"], media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename={file_key}"})
