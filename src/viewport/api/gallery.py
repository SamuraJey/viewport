import logging
import uuid
from asyncio import run as asyncio_run

import zipstream
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.api.public import _build_zip_fallback_name, _make_unique_zip_entry_name, _sanitize_zip_entry_name
from viewport.auth_utils import get_current_user
from viewport.background_tasks import delete_gallery_data_task
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.models.db import get_db
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client as get_sync_s3_client
from viewport.s3_utils import get_s3_settings
from viewport.schemas.gallery import GalleryCreateRequest, GalleryDetailResponse, GalleryListResponse, GalleryResponse, GalleryUpdateRequest
from viewport.schemas.photo import DownloadSelectedPhotosRequest, GalleryPhotoResponse

router = APIRouter(prefix="/galleries", tags=["galleries"])
logger = logging.getLogger(__name__)


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


@router.post("", response_model=GalleryResponse, status_code=status.HTTP_201_CREATED)
async def create_gallery(
    request: GalleryCreateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    gallery = await repo.create_gallery(current_user.id, request.name, request.shooting_date)
    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        shooting_date=gallery.shooting_date,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
    )


@router.get("", response_model=GalleryListResponse)
async def list_galleries(
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
) -> GalleryListResponse:
    galleries, total = await repo.get_galleries_by_owner(current_user.id, page, size)
    return GalleryListResponse(
        galleries=[
            GalleryResponse(
                id=str(g.id),
                owner_id=str(g.owner_id),
                name=g.name,
                created_at=g.created_at,
                shooting_date=g.shooting_date,
                cover_photo_id=str(g.cover_photo_id) if g.cover_photo_id else None,
            )
            for g in galleries
        ],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{gallery_id}", response_model=GalleryDetailResponse)
async def get_gallery_detail(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
    limit: int | None = Query(None, ge=1, le=1000, description="Limit number of photos returned (for pagination)"),
    offset: int = Query(0, ge=0, description="Offset for photo pagination"),
) -> GalleryDetailResponse:
    """Get gallery detail with photos."""
    import time

    start_time = time.monotonic()

    db_start = time.monotonic()
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    db_time = time.monotonic() - db_start

    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    # Use repository methods that perform efficient DB queries instead of loading the whole relationship
    photo_count = await repo.get_photo_count_by_gallery(gallery_id)

    if limit is not None:
        photos_to_process = await repo.get_photos_by_gallery_paginated(gallery_id, limit, offset)
        logger.info("Gallery %s: DB query took %.3fs, total photos: %s, returning: %s (offset=%s, limit=%s)", gallery_id, db_time, photo_count, len(photos_to_process), offset, limit)
    else:
        photos_to_process = await repo.get_photos_by_gallery_id(gallery_id)
        logger.info("Gallery %s: DB query took %.3fs, photos count: %s", gallery_id, db_time, photo_count)

    # Generate presigned URLs without blocking the request event loop.
    url_start = time.monotonic()
    photo_responses = await GalleryPhotoResponse.from_db_photos_batch(photos_to_process, s3_client)
    url_time = time.monotonic() - url_start

    # Calculate URLs per second
    urls_generated = len(photos_to_process) * 2
    urls_per_second = urls_generated / url_time if url_time > 0 else 0

    total_time = time.monotonic() - start_time
    logger.info("Gallery %s: URL generation took %.3fs (%s URLs, %.0f URLs/s), total time: %.3fs", gallery_id, url_time, urls_generated, urls_per_second, total_time)

    return GalleryDetailResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        shooting_date=gallery.shooting_date,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
        photos=photo_responses,
        total_photos=photo_count,
    )


def _build_gallery_zip_response(gallery_id: uuid.UUID, photos: list, archive_name: str) -> StreamingResponse:
    if not photos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No photos found")

    settings = get_s3_settings()
    z = zipstream.ZipStream()
    used_names: set[str] = set()

    for photo in photos:
        object_key = photo.object_key
        fallback = _build_zip_fallback_name(photo.display_name, object_key=object_key, fallback_stem=f"photo-{photo.id}")
        filename = _sanitize_zip_entry_name(photo.display_name, fallback=fallback)
        filename = _make_unique_zip_entry_name(filename, used_names)

        def file_generator(key: str = object_key):
            client = get_sync_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    headers = {"Content-Disposition": f'attachment; filename="{archive_name}"'}
    logger.info("Prepared private zip download for gallery %s with %s photos", gallery_id, len(photos))
    return StreamingResponse(z, media_type="application/zip", headers=headers)


@router.get("/{gallery_id}/download/all")
def download_gallery_zip(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    gallery = asyncio_run(repo.get_gallery_by_id_and_owner(gallery_id, current_user.id))
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    photos = asyncio_run(repo.get_photos_by_gallery_id(gallery_id))
    return _build_gallery_zip_response(gallery_id, photos, archive_name=f"gallery_{gallery_id}.zip")


@router.post("/{gallery_id}/download/selected")
def download_selected_photos_zip(
    gallery_id: uuid.UUID,
    request: DownloadSelectedPhotosRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    gallery = asyncio_run(repo.get_gallery_by_id_and_owner(gallery_id, current_user.id))
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    ordered_photo_ids = list(dict.fromkeys(request.photo_ids))
    photos = asyncio_run(repo.get_photos_by_ids_and_gallery(gallery_id, ordered_photo_ids))
    photo_by_id = {photo.id: photo for photo in photos}

    if len(photo_by_id) != len(ordered_photo_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more selected photos were not found")

    ordered_photos = [photo_by_id[photo_id] for photo_id in ordered_photo_ids]
    return _build_gallery_zip_response(gallery_id, ordered_photos, archive_name=f"gallery_{gallery_id}_selected.zip")


@router.post("/{gallery_id}/cover/{photo_id}", response_model=GalleryResponse)
async def set_cover_photo(
    gallery_id: uuid.UUID,
    photo_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    logger.info("Setting cover photo for gallery %s, photo %s, user %s", gallery_id, photo_id, current_user.id)

    gallery = await repo.set_cover_photo(gallery_id, photo_id, current_user.id)
    if not gallery:
        logger.warning("Gallery %s or photo %s not found", gallery_id, photo_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery or photo not found")

    logger.info("Cover photo set successfully: gallery %s, cover_photo_id=%s", gallery_id, gallery.cover_photo_id)

    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        shooting_date=gallery.shooting_date,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
    )


@router.delete("/{gallery_id}/cover", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cover_photo(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    gallery = await repo.clear_cover_photo(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")


@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    if not await repo.soft_delete_gallery(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    await run_in_threadpool(delete_gallery_data_task.delay, str(gallery_id))


@router.patch("/{gallery_id}", response_model=GalleryResponse)
async def update_gallery(
    gallery_id: uuid.UUID,
    request: GalleryUpdateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    gallery = await repo.update_gallery(gallery_id, current_user.id, name=request.name, shooting_date=request.shooting_date)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")
    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        shooting_date=gallery.shooting_date,
        cover_photo_id=str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None,
    )
