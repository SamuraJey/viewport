from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.models.gallery import Gallery
from src.viewport.models.sharelink import ShareLink
from src.viewport.schemas.sharelink import ShareLinkCreateRequest, ShareLinkResponse

router = APIRouter(prefix="/galleries/{gallery_id}/share-links", tags=["sharelinks"])


@router.post("", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
def create_sharelink(gallery_id: UUID, req: ShareLinkCreateRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    gallery = db.query(Gallery).filter(Gallery.id == gallery_id, Gallery.owner_id == user.id).first()
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    sharelink = ShareLink(gallery_id=gallery_id, expires_at=req.expires_at, created_at=datetime.utcnow())
    db.add(sharelink)
    db.commit()
    db.refresh(sharelink)
    return sharelink
