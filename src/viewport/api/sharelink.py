from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.repositories.gallery_repository import GalleryRepository
from src.viewport.schemas.sharelink import ShareLinkCreateRequest, ShareLinkResponse

router = APIRouter(prefix="/galleries/{gallery_id}/share-links", tags=["sharelinks"])


def get_gallery_repository(db: Session = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


@router.post("", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
def create_sharelink(gallery_id: UUID, req: ShareLinkCreateRequest, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    sharelink = repo.create_sharelink(gallery_id, req.expires_at)
    return sharelink


@router.delete("/{sharelink_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sharelink(gallery_id: UUID, sharelink_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    if not repo.delete_sharelink(sharelink_id, gallery_id, user.id):
        raise HTTPException(status_code=404, detail="Share link not found")
    return
