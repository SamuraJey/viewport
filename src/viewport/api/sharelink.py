from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.auth_utils import get_current_user
from viewport.models.db import get_db
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.schemas.sharelink import GalleryShareLinkResponse, ShareLinkCreateRequest

router = APIRouter(prefix="/galleries/{gallery_id}/share-links", tags=["sharelinks"])


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


@router.get("", response_model=list[GalleryShareLinkResponse])
async def list_sharelinks(
    gallery_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user=Depends(get_current_user),
) -> list[GalleryShareLinkResponse]:
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    sharelinks = await repo.get_sharelinks_by_gallery(gallery_id, user.id)
    return [GalleryShareLinkResponse.model_validate(sharelink) for sharelink in sharelinks]


@router.post("", response_model=GalleryShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_sharelink(gallery_id: UUID, req: ShareLinkCreateRequest, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    sharelink = await repo.create_sharelink(gallery_id, req.expires_at)
    return GalleryShareLinkResponse.model_validate(sharelink)


@router.delete("/{sharelink_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sharelink(gallery_id: UUID, sharelink_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    if not await repo.delete_sharelink(sharelink_id, gallery_id, user.id):
        raise HTTPException(status_code=404, detail="Share link not found")
    return
