from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ShareLinkBase(BaseModel):
    expires_at: datetime | None = None


class ShareLinkCreateRequest(ShareLinkBase):
    pass


class GalleryShareLinkResponse(ShareLinkBase):
    id: UUID
    views: int
    zip_downloads: int
    single_downloads: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ShareLinkResponse(GalleryShareLinkResponse):
    gallery_id: UUID
