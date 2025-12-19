from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from viewport.schemas.photo import PhotoResponse
from viewport.schemas.sharelink import ShareLinkResponse


class GalleryCreateRequest(BaseModel):
    name: str = Field("", description="Custom name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")


class GalleryUpdateRequest(BaseModel):
    name: str | None = Field(None, description="New name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")

    @model_validator(mode="after")
    def validate_payload(self):
        if self.name is None and self.shooting_date is None:
            raise ValueError("At least one field must be provided for update")
        return self


class GalleryResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    shooting_date: date
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")


class GalleryDetailResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    shooting_date: date
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")
    photos: list[PhotoResponse]
    share_links: list[ShareLinkResponse]
    total_photos: int = Field(..., description="Total number of photos in the gallery")


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
