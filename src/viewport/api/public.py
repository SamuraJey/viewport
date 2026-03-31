import contextlib
from asyncio import run as asyncio_run
from uuid import UUID

import zipstream
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.logger import logger
from viewport.models.db import get_db
from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client, get_s3_settings
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder
from viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto
from viewport.sharelink_utils import is_sharelink_expired
from viewport.zip_utils import build_zip_fallback_name, make_unique_zip_entry_name, sanitize_zip_entry_name

router = APIRouter(prefix="/s", tags=["public"])
PUBLIC_CACHE_CONTROL_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
    safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
    return f'{disposition_type}; filename="{safe_filename}"'


def _resolve_public_sorting(gallery: Gallery) -> tuple[GalleryPhotoSortBy, SortOrder]:
    sort_by = GalleryPhotoSortBy.ORIGINAL_FILENAME
    sort_order = SortOrder.ASC

    with contextlib.suppress(ValueError):
        sort_by = GalleryPhotoSortBy(getattr(gallery, "public_sort_by", sort_by.value))
    with contextlib.suppress(ValueError):
        sort_order = SortOrder(getattr(gallery, "public_sort_order", sort_order.value))

    return sort_by, sort_order


def get_sharelink_repository(db: AsyncSession = Depends(get_db)) -> ShareLinkRepository:
    return ShareLinkRepository(db)


async def get_valid_sharelink(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository)) -> ShareLink:
    """Get valid sharelink."""
    sharelink = await repo.get_sharelink_for_public_access(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if not sharelink.is_active:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if is_sharelink_expired(sharelink.expires_at):
        raise HTTPException(status_code=410, detail="ShareLink expired", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink


@router.get("/{share_id}", response_model=PublicGalleryResponse)
async def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    response: Response,
    limit: int | None = Query(None, ge=1, le=500, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> PublicGalleryResponse:
    """Get public gallery photos."""
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)

    gallery: Gallery = sharelink.gallery
    sort_by, order = _resolve_public_sorting(gallery)

    total_photos = await repo.get_photo_count_by_gallery(sharelink.gallery_id)
    photos_to_process = await repo.get_photos_by_gallery_id(
        gallery_id=sharelink.gallery_id,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        order=order,
    )

    logger.info(
        "Generating public gallery view for share %s with %s photos (offset=%s, limit=%s, total=%s, sort_by=%s, order=%s)",
        share_id,
        len(photos_to_process),
        offset,
        limit,
        total_photos,
        sort_by.value,
        order.value,
    )

    thumbnail_keys = [photo.thumbnail_object_key for photo in photos_to_process]
    thumb_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(
        {photo.object_key: _build_content_disposition(photo.display_name, disposition_type="inline") for photo in photos_to_process}
    )

    photo_list = []
    for photo in photos_to_process:
        presigned_url = full_url_map.get(photo.object_key, "")
        presigned_url_thumb = thumb_url_map.get(photo.thumbnail_object_key, "")

        if presigned_url and presigned_url_thumb:
            photo_list.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    thumbnail_url=presigned_url_thumb,
                    full_url=presigned_url,
                    filename=photo.display_name,
                    width=getattr(photo, "width", None),
                    height=getattr(photo, "height", None),
                )
            )

    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = None

    logger.info("Public gallery %s: cover_photo_id=%s", gallery.id, cover_id)

    if cover_id:
        # Explicitly fetch the cover photo from database instead of relying on viewonly relationship
        # This ensures we get the most up-to-date cover_photo even after it's just been set
        cover_photo_obj = None
        if gallery.cover_photo_id:
            stmt = select(Photo).where(Photo.id == gallery.cover_photo_id)
            cover_photo_obj = (await repo.db.execute(stmt)).scalar_one_or_none()

            if cover_photo_obj:
                logger.info("Found cover photo: %s", cover_photo_obj.object_key)
            else:
                logger.warning("Cover photo %s not found in database", cover_id)

        cover_filename = None
        cover_url = None
        if cover_photo_obj:
            cover_filename = cover_photo_obj.display_name
            cover_url = full_url_map.get(cover_photo_obj.object_key) or await s3_client.generate_presigned_url_async(
                cover_photo_obj.object_key,
                response_content_disposition=_build_content_disposition(cover_photo_obj.display_name, disposition_type="inline"),
            )
            cover_thumb_url = thumb_url_map.get(cover_photo_obj.thumbnail_object_key, cover_url)
            if cover_url == cover_thumb_url:
                logger.warning("Cover photo %s presigned URL is the same for full and thumbnail, which may indicate an issue: %s", cover_id, cover_url)

        if cover_url:
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_thumb_url, filename=cover_filename)
            logger.info("Cover set successfully: %s", cover_filename)
        else:
            logger.warning("Cover URL not generated for photo %s", cover_id)

    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    dt = getattr(gallery, "shooting_date", None) or getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views only on first page load (offset=0)
    if offset == 0:
        client_ip = request.client.host if request.client else None
        await repo.record_view(
            share_id,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )

    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
        total_photos=total_photos,
    )


# intetionally not async
@router.get("/{share_id}/download/all")
def download_all_photos_zip(
    share_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    """Download all photos as zip."""
    photos = asyncio_run(repo.get_photos_by_gallery_id(sharelink.gallery_id))

    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: p.display_name.lower())

    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    settings = get_s3_settings()

    z = zipstream.ZipStream()
    used_names: set[str] = set()

    for photo in photos:
        key = photo.object_key
        fallback = build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
        filename = sanitize_zip_entry_name(photo.display_name, fallback=fallback)
        filename = make_unique_zip_entry_name(filename, used_names)

        def file_generator(object_key: str = key):
            client = get_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=object_key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    asyncio_run(repo.record_zip_download(share_id))
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})

    headers = {
        "Content-Disposition": f'attachment; filename="gallery_{share_id}.zip"',
        **PUBLIC_CACHE_CONTROL_HEADERS,
    }

    return StreamingResponse(z, media_type="application/zip", headers=headers)
