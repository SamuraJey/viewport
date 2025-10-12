import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.models.user import User
from src.viewport.repositories.gallery_repository import GalleryRepository
from src.viewport.schemas.gallery import GalleryCreateRequest, GalleryDetailResponse, GalleryListResponse, GalleryResponse, GalleryUpdateRequest
from viewport.schemas.photo import PhotoResponse
from viewport.schemas.sharelink import ShareLinkResponse

router = APIRouter(prefix="/galleries", tags=["galleries"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


@router.post("/", response_model=GalleryResponse, status_code=status.HTTP_201_CREATED)
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


@router.get("/", response_model=GalleryListResponse)
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
    gallery_id: str,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryDetailResponse:
    # Validate UUID
    try:
        gallery_uuid = uuid.UUID(gallery_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid gallery ID format") from e

    gallery = repo.get_gallery_by_id_and_owner(gallery_uuid, current_user.id)

    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    # Use batch method for faster photo URL generation
    photo_responses = await PhotoResponse.from_db_photos_batch(gallery.photos)

    return GalleryDetailResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
        photos=photo_responses,
        share_links=[ShareLinkResponse.model_validate(link) for link in gallery.share_links],
    )


@router.post("/{gallery_id}/cover/{photo_id}", response_model=GalleryResponse)
def set_cover_photo(
    gallery_id: str,
    photo_id: str,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    # Validate UUIDs
    try:
        gallery_uuid = uuid.UUID(gallery_id)
        photo_uuid = uuid.UUID(photo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format") from e

    gallery = repo.set_cover_photo(gallery_uuid, photo_uuid, current_user.id)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery or photo not found")

    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
    )


@router.delete("/{gallery_id}/cover", status_code=status.HTTP_204_NO_CONTENT)
def clear_cover_photo(
    gallery_id: str,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    try:
        gallery_uuid = uuid.UUID(gallery_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format") from e
    gallery = repo.clear_cover_photo(gallery_uuid, current_user.id)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")


@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gallery(
    gallery_id: str,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    # Convert string to UUID
    try:
        gallery_uuid = UUID(gallery_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid gallery ID format") from None

    if not repo.delete_gallery(gallery_uuid, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")


@router.patch("/{gallery_id}", response_model=GalleryResponse)
def update_gallery(
    gallery_id: str,
    request: GalleryUpdateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    # Validate UUID
    try:
        gallery_uuid = uuid.UUID(gallery_id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid gallery ID format") from err
    # Update gallery
    gallery = repo.update_gallery_name(gallery_uuid, current_user.id, request.name)
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")
    return GalleryResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        name=gallery.name,
        created_at=gallery.created_at,
        cover_photo_id=str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None,
    )
