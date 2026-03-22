from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH
from viewport.schemas.photo import GalleryPhotoResponse


class GalleryCreateRequest(BaseModel):
    name: str = Field("", max_length=GALLERY_NAME_MAX_LENGTH, description="Custom name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")


class GalleryUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=GALLERY_NAME_MAX_LENGTH, description="New name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")

    @model_validator(mode="after")
    def validate_payload(self) -> Self:
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
    photos: list[GalleryPhotoResponse]
    total_photos: int = Field(..., description="Total number of photos in the gallery")
    total_size_bytes: int = Field(..., description="Total size of photos in bytes")


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
