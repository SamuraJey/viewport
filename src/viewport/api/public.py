import contextlib
from uuid import UUID

import zipstream
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.logger import logger
from viewport.models.db import get_db
from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client, get_s3_settings
from viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto

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
    limit: int | None = Query(None, ge=1, le=1000, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> PublicGalleryResponse:
    # Photos - ensure deterministic ordering by filename (case-insensitive)
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: (p.object_key.split("/", 1)[1].lower() if "/" in p.object_key else p.object_key.lower()))

    # Apply pagination if limit is specified
    photos_to_process = photos[offset : offset + limit] if limit else photos

    logger.info(f"Generating public gallery view for share {share_id} with {len(photos_to_process)} photos (offset={offset}, limit={limit}, total={len(photos)})")

    object_keys = []
    for photo in photos_to_process:
        object_keys.append(photo.object_key)
        object_keys.append(photo.thumbnail_object_key)

    url_map = await s3_client.generate_presigned_urls_batch(object_keys)

    photo_list = []
    for photo in photos_to_process:
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

    logger.info(f"Public gallery {gallery.id}: cover_photo_id={cover_id}")

    if cover_id:
        # Explicitly fetch the cover photo from database instead of relying on viewonly relationship
        # This ensures we get the most up-to-date cover_photo even after it's just been set
        cover_photo_obj = None
        if gallery.cover_photo_id:
            stmt = select(Photo).where(Photo.id == gallery.cover_photo_id)
            cover_photo_obj = repo.db.execute(stmt).scalar_one_or_none()

            if cover_photo_obj:
                logger.info(f"Found cover photo: {cover_photo_obj.object_key}")
            else:
                logger.warning(f"Cover photo {cover_id} not found in database")

        cover_filename = None
        cover_url = None
        if cover_photo_obj:
            cover_filename = cover_photo_obj.object_key.split("/", 1)[1] if "/" in cover_photo_obj.object_key else cover_photo_obj.object_key
            cover_url = url_map.get(cover_photo_obj.object_key)
            cover_thumb_url = url_map.get(cover_photo_obj.thumbnail_object_key)

        if cover_url:
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_thumb_url, filename=cover_filename)
            logger.info(f"Cover set successfully: {cover_filename}")
        else:
            logger.warning(f"Cover URL not generated for photo {cover_id}")

    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    dt = getattr(gallery, "shooting_date", None) or getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views only on first page load (offset=0)
    if offset == 0:
        repo.increment_views(share_id)

    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
        total_photos=len(photos),
    )


@router.get("/{share_id}/download/all")
def download_all_photos_zip(
    share_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    photos = repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: (p.object_key.split("/", 1)[1].lower() if "/" in p.object_key else p.object_key.lower()))
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    settings = get_s3_settings()

    z = zipstream.ZipStream()

    for photo in photos:
        key = photo.object_key
        filename = key.split("/")[-1]

        def file_generator(object_key: str = key):
            client = get_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=object_key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    repo.increment_zip_downloads(share_id)
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})

    headers = {"Content-Disposition": f'attachment; filename="gallery_{share_id}.zip"'}

    return StreamingResponse(z, media_type="application/zip", headers=headers)
