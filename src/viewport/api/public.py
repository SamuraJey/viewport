import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.viewport.cache_utils import url_cache
from src.viewport.db import get_db
from src.viewport.logger import logger
from src.viewport.minio_utils import generate_presigned_url, generate_presigned_urls_batch, get_minio_config, get_s3_client
from src.viewport.models.gallery import Gallery
from src.viewport.models.sharelink import ShareLink
from src.viewport.repositories.sharelink_repository import ShareLinkRepository
from src.viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto

router = APIRouter(prefix="/s", tags=["public"])


def get_sharelink_repository(db: Session = Depends(get_db)) -> ShareLinkRepository:
    return ShareLinkRepository(db)


def get_valid_sharelink(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository)) -> ShareLink:
    sharelink = repo.get_valid_sharelink(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found")
    return sharelink


@router.get("/{share_id}", response_model=PublicGalleryResponse)
def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> PublicGalleryResponse:
    # Photos
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)

    # Generate presigned URLs for all photos at once for efficiency
    object_keys = [photo.object_key for photo in photos]
    presigned_urls = generate_presigned_urls_batch(object_keys, expires_in=7200)  # 2 hours expiration for public links

    photo_list = [
        PublicPhoto(
            photo_id=str(photo.id),
            # Use presigned URLs directly
            thumbnail_url=presigned_urls.get(photo.object_key, ""),
            full_url=presigned_urls.get(photo.object_key, ""),
        )
        for photo in photos
        if photo.object_key in presigned_urls  # Only include photos with valid URLs
    ]

    # Gallery metadata
    gallery: Gallery = sharelink.gallery  # lazy-loaded
    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = None
    if cover_id:
        # Find cover photo and generate presigned URL
        cover_photo = next((p for p in photos if str(p.id) == cover_id), None)
        if cover_photo and cover_photo.object_key in presigned_urls:
            cover_url = presigned_urls[cover_photo.object_key]
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_url)

    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    # Format date as DD.MM.YYYY similar to wfolio sample
    dt = getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views
    repo.increment_views(share_id)
    logger.log_event("view_gallery", share_id=share_id)
    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
    )


@router.get("/{share_id}/photos/{photo_id}/url")
@url_cache(max_age=7200)  # 2 hours for public links
def get_photo_url_by_sharelink(share_id: UUID, photo_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    """Get presigned URL for a photo in a public gallery"""
    photo = repo.get_photo_by_id_and_gallery(photo_id, sharelink.gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    logger.log_event("view_photo", share_id=share_id, extra={"photo_id": str(photo_id)})

    # Generate presigned URL
    try:
        url = generate_presigned_url(photo.object_key, expires_in=7200)  # 2 hours expiration for public links
        return {"url": url, "expires_in": 7200}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate photo URL") from e


@router.get("/{share_id}/download/all")
def download_all_photos_zip(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
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
    repo.increment_zip_downloads(share_id)
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})
    return StreamingResponse(zip_buffer, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=gallery.zip"})


@router.get("/{share_id}/download/{photo_id}")
def download_single_photo(share_id: UUID, photo_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photo = repo.get_photo_by_id_and_gallery(photo_id, sharelink.gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Stream file from S3
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()
    # Use stored object key
    file_key = photo.object_key
    obj = s3_client.get_object(Bucket=bucket, Key=file_key)
    repo.increment_single_downloads(share_id)
    logger.log_event("download_photo", share_id=share_id, extra={"photo_id": str(photo_id)})
    return StreamingResponse(obj["Body"], media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename={file_key}"})
