from datetime import datetime

from pydantic import BaseModel, Field

from viewport.schemas.photo import PhotoResponse
from viewport.schemas.sharelink import ShareLinkResponse


class GalleryCreateRequest(BaseModel):
    name: str = Field("", description="Custom name for the gallery")


class GalleryUpdateRequest(BaseModel):
    name: str = Field(..., description="New name for the gallery")


class GalleryResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")


class GalleryDetailResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")
    photos: list[PhotoResponse]
    share_links: list[ShareLinkResponse]


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
