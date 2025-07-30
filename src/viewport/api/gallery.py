import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.models.gallery import Gallery
from src.viewport.models.user import User
from src.viewport.schemas.gallery import GalleryCreateRequest, GalleryDetailResponse, GalleryListResponse, GalleryResponse
from src.viewport.schemas.photo import PhotoResponse
from src.viewport.schemas.sharelink import ShareLinkResponse

router = APIRouter(prefix="/galleries", tags=["galleries"])


@router.post("/", response_model=GalleryResponse, status_code=status.HTTP_201_CREATED)
def create_gallery(
    _: GalleryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GalleryResponse:
    gallery = Gallery(id=uuid.uuid4(), owner_id=current_user.id)
    db.add(gallery)
    db.commit()
    db.refresh(gallery)
    return GalleryResponse(id=str(gallery.id), owner_id=str(gallery.owner_id), created_at=gallery.created_at)


@router.get("/", response_model=GalleryListResponse)
def list_galleries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
) -> GalleryListResponse:
    query = db.query(Gallery).filter(Gallery.owner_id == current_user.id)
    total = query.count()
    galleries = query.order_by(Gallery.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return GalleryListResponse(
        galleries=[GalleryResponse(id=str(g.id), owner_id=str(g.owner_id), created_at=g.created_at) for g in galleries],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{gallery_id}", response_model=GalleryDetailResponse)
def get_gallery(
    gallery_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GalleryDetailResponse:
    try:
        gallery_uuid = uuid.UUID(gallery_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid gallery ID format") from e

    gallery = db.query(Gallery).options(joinedload(Gallery.photos), joinedload(Gallery.share_links)).filter(Gallery.id == gallery_uuid, Gallery.owner_id == current_user.id).first()

    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    return GalleryDetailResponse(
        id=str(gallery.id),
        owner_id=str(gallery.owner_id),
        created_at=gallery.created_at,
        photos=[PhotoResponse.from_db_photo(photo) for photo in gallery.photos],
        share_links=[ShareLinkResponse.model_validate(link) for link in gallery.share_links],
    )


@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gallery(
    gallery_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        gallery_uuid = uuid.UUID(gallery_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid gallery ID format") from e

    gallery = db.query(Gallery).filter(Gallery.id == gallery_uuid, Gallery.owner_id == current_user.id).first()
    if not gallery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found")

    db.delete(gallery)
    db.commit()
    return
