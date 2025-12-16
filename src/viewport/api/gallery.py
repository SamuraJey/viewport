import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client
from viewport.models.db import get_db
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.gallery import GalleryCreateRequest, GalleryDetailResponse, GalleryListResponse, GalleryResponse, GalleryUpdateRequest
from viewport.schemas.photo import PhotoResponse
from viewport.schemas.sharelink import ShareLinkResponse

router = APIRouter(prefix="/galleries", tags=["galleries"])
logger = logging.getLogger(__name__)


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


@router.post("", response_model=GalleryResponse, status_code=status.HTTP_201_CREATED)
def create_gallery(
    request: GalleryCreateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    gallery = repo.create_gallery(current_user.id, request.name)
    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
    )


@router.get("", response_model=GalleryListResponse)
def list_galleries(
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
) -> GalleryListResponse:
    galleries, total = repo.get_galleries_by_owner(current_user.id, page, size)
    return GalleryListResponse(
        galleries=[
            GalleryResponse(
                id=str(g.id),
                owner_id=str(g.owner_id),
                name=g.name,
                created_at=g.created_at,
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
    s3_client: AsyncS3Client = Depends(get_s3_client),
    limit: int | None = Query(None, ge=1, le=1000, description="Limit number of photos returned (for pagination)"),
    offset: int = Query(0, ge=0, description="Offset for photo pagination"),
) -> GalleryDetailResponse:
    import time

    start_time = time.monotonic()

    db_start = time.monotonic()
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    db_time = time.monotonic() - db_start

    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    photo_count = len(gallery.photos)

    # Apply pagination if limit is provided
    photos_to_process = gallery.photos
    if limit is not None:
        photos_to_process = gallery.photos[offset : offset + limit]
        logger.info(f"Gallery {gallery_id}: DB query took {db_time:.3f}s, total photos: {photo_count}, returning: {len(photos_to_process)} (offset={offset}, limit={limit})")
    else:
        logger.info(f"Gallery {gallery_id}: DB query took {db_time:.3f}s, photos count: {photo_count}")

    # Use batch method for faster photo URL generation
    url_start = time.monotonic()
    photo_responses = await PhotoResponse.from_db_photos_batch(photos_to_process, s3_client)
    url_time = time.monotonic() - url_start

    # Calculate URLs per second
    urls_generated = len(photos_to_process) * 2
    urls_per_second = urls_generated / url_time if url_time > 0 else 0

    total_time = time.monotonic() - start_time
    logger.info(f"Gallery {gallery_id}: URL generation took {url_time:.3f}s ({urls_generated} URLs, {urls_per_second:.0f} URLs/s), total time: {total_time:.3f}s")

    return GalleryDetailResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
        photos=photo_responses,
        share_links=[ShareLinkResponse.model_validate(link) for link in gallery.share_links],
        total_photos=photo_count,
    )


@router.post("/{gallery_id}/cover/{photo_id}", response_model=GalleryResponse)
def set_cover_photo(
    gallery_id: uuid.UUID,
    photo_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    logger.info(f"Setting cover photo for gallery {gallery_id}, photo {photo_id}, user {current_user.id}")

    gallery = repo.set_cover_photo(gallery_id, photo_id, current_user.id)
    if not gallery:
        logger.warning(f"Gallery {gallery_id} or photo {photo_id} not found")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery or photo not found")

    logger.info(f"Cover photo set successfully: gallery {gallery_id}, cover_photo_id={gallery.cover_photo_id}")

    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
    )


@router.delete("/{gallery_id}/cover", status_code=status.HTTP_204_NO_CONTENT)
def clear_cover_photo(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    gallery = repo.clear_cover_photo(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")


@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery(
    gallery_id: uuid.UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> None:
    if not await repo.delete_gallery_async(gallery_id, current_user.id, s3_client):
        raise HTTPException(status_code=404, detail="Gallery not found")


@router.patch("/{gallery_id}", response_model=GalleryResponse)
def update_gallery(
    gallery_id: uuid.UUID,
    request: GalleryUpdateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    gallery = repo.update_gallery_name(gallery_id, current_user.id, request.name)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")
    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None,
    )
