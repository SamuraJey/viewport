from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ShareLinkBase(BaseModel):
    gallery_id: UUID
    expires_at: datetime | None = None


class ShareLinkCreateRequest(ShareLinkBase):
    pass


class ShareLinkResponse(ShareLinkBase):
    id: UUID
    views: int
    zip_downloads: int
    single_downloads: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
