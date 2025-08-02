from datetime import datetime

from pydantic import BaseModel, Field

from src.viewport.schemas.photo import PhotoResponse
from src.viewport.schemas.sharelink import ShareLinkResponse


class GalleryCreateRequest(BaseModel):
    name: str = Field("", description="Custom name for the gallery")


class GalleryResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime


class GalleryDetailResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    photos: list[PhotoResponse]
    share_links: list[ShareLinkResponse]


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
