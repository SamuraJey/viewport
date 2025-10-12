import contextlib
import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.viewport.db import get_db
from src.viewport.logger import logger
from src.viewport.minio_utils import generate_presigned_url, get_minio_config, get_s3_client
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
async def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> PublicGalleryResponse:
    # Photos - ensure deterministic ordering by filename (case-insensitive)
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: (p.object_key.split("/", 1)[1].lower() if "/" in p.object_key else p.object_key.lower()))

    logger.info("Generating public gallery view for share %s with %d photos", share_id, len(photos))

    # Generate all presigned URLs in batch (much faster!)
    from src.viewport.minio_utils import async_generate_presigned_urls_batch

    object_keys = []
    for photo in photos:
        object_keys.append(photo.object_key)
        object_keys.append(photo.thumbnail_object_key)

    url_map = await async_generate_presigned_urls_batch(object_keys)

    # Build photo list
    photo_list = []
    for photo in photos:
        presigned_url = url_map.get(photo.object_key, "")
        presigned_url_thumb = url_map.get(photo.thumbnail_object_key, "")

        if presigned_url and presigned_url_thumb:
            photo_list.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    thumbnail_url=presigned_url_thumb,
                    full_url=presigned_url,
                    filename=(photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key),
                    width=getattr(photo, "width", None),
                    height=getattr(photo, "height", None),
                )
            )

    gallery: Gallery = sharelink.gallery  # lazy-loaded
    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = None
    if cover_id:
        # Try to obtain filename from gallery.cover_photo_id via gallery relationship
        cover_photo_obj = None
        try:
            # gallery.cover_photo is viewonly relationship to Photo
            cover_photo_obj = getattr(gallery, "cover_photo", None)
        except Exception:
            cover_photo_obj = None

        cover_filename = None
        cover_url = None
        if cover_photo_obj:
            cover_filename = cover_photo_obj.object_key.split("/", 1)[1] if "/" in cover_photo_obj.object_key else cover_photo_obj.object_key
            cover_url = url_map.get(cover_photo_obj.object_key)

        if cover_url:
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_url, filename=cover_filename)

    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    # Format date as DD.MM.YYYY similar to wfolio sample
    dt = getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views
    repo.increment_views(share_id)

    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
    )


@router.get("/{share_id}/photos/urls", response_model=list[PublicPhoto])
async def get_all_public_photo_urls(
    share_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> list[PublicPhoto]:
    """Get presigned URLs for all photos in a public gallery"""
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: (p.object_key.split("/", 1)[1].lower() if "/" in p.object_key else p.object_key.lower()))

    # Generate all presigned URLs in batch
    from src.viewport.minio_utils import async_generate_presigned_urls_batch

    object_keys = []
    for photo in photos:
        object_keys.append(photo.object_key)
        object_keys.append(photo.thumbnail_object_key)

    url_map = await async_generate_presigned_urls_batch(object_keys)

    photo_list = []
    for photo in photos:
        presigned_url = url_map.get(photo.object_key, "")
        presigned_url_thumb = url_map.get(photo.thumbnail_object_key, "")

        if presigned_url and presigned_url_thumb:
            photo_list.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    thumbnail_url=presigned_url_thumb,
                    full_url=presigned_url,
                    filename=(photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key),
                    width=getattr(photo, "width", None),
                    height=getattr(photo, "height", None),
                )
            )

    logger.log_event("view_gallery_urls", share_id=share_id, extra={"photo_count": len(photo_list)})
    return photo_list


@router.get("/{share_id}/photos/{photo_id}/url")
def get_public_photo_presigned_url(share_id: UUID, photo_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    """Get presigned URL for a photo from public gallery"""
    photo = repo.get_photo_by_id_and_gallery(photo_id, sharelink.gallery_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    logger.log_event("view_photo", share_id=share_id, extra={"photo_id": str(photo_id)})

    # Generate presigned URL
    presigned_url = generate_presigned_url(photo.object_key)
    return {"url": presigned_url}


@router.get("/{share_id}/photos/{photo_id}")
def get_photo_by_sharelink(share_id: UUID, photo_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    """Stream a photo from public gallery with proper caching headers"""
    photo = repo.get_photo_by_id_and_gallery(photo_id, sharelink.gallery_id)
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

    # Determine MIME type
    import mimetypes

    mime_type, _ = mimetypes.guess_type(photo.object_key)
    if not mime_type:
        mime_type = obj.get("ContentType", "image/jpeg")

    # Create response with aggressive caching headers for public content
    response = StreamingResponse(
        obj["Body"],
        media_type=mime_type,
        headers={
            "Cache-Control": "public, max-age=86400, immutable",  # 24 hours cache
            "ETag": f'"{photo_id}"',
            "Expires": "Thu, 31 Dec 2037 23:55:55 GMT",  # Far future expires
        },
    )

    return response


@router.get("/{share_id}/download/all")
def download_all_photos_zip(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository), sharelink: ShareLink = Depends(get_valid_sharelink)):
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: (p.object_key.split("/", 1)[1].lower() if "/" in p.object_key else p.object_key.lower()))
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
    # TODO выплить нафиг и дать фронту скачивать напрямую по presigned URL
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
