import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.app.auth_utils import get_current_user
from src.app.db import get_db
from src.app.models.gallery import Gallery
from src.app.models.user import User
from src.app.schemas.gallery import GalleryCreateRequest, GalleryListResponse, GalleryResponse

router = APIRouter(prefix="/galleries", tags=["galleries"])


@router.post("/", response_model=GalleryResponse, status_code=status.HTTP_201_CREATED)
def create_gallery(
    _: GalleryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
):
    query = db.query(Gallery).filter(Gallery.owner_id == current_user.id)
    total = query.count()
    galleries = query.order_by(Gallery.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return GalleryListResponse(
        galleries=[GalleryResponse(id=str(g.id), owner_id=str(g.owner_id), created_at=g.created_at) for g in galleries],
        total=total,
        page=page,
        size=size,
    )
