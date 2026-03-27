from datetime import date, datetime
from enum import Enum
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH, PHOTO_SEARCH_MAX_LENGTH, PUBLIC_GALLERY_SORT_BY_DEFAULT, PUBLIC_GALLERY_SORT_ORDER_DEFAULT
from viewport.schemas.photo import GalleryPhotoResponse


class GalleryPhotoSortBy(str, Enum):
    CREATED_AT = "created_at"
    ORIGINAL_FILENAME = "original_filename"
    FILE_SIZE = "file_size"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


class GalleryPhotoQueryParams(BaseModel):
    search: str | None = Field(None, max_length=PHOTO_SEARCH_MAX_LENGTH, description="Case-insensitive partial filename search")
    sort_by: GalleryPhotoSortBy | None = Field(None, description="Photo sorting field")
    order: SortOrder | None = Field(None, description="Sort direction")

    @field_validator("search")
    @classmethod
    def normalize_search(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class GalleryCreateRequest(BaseModel):
    name: str = Field("", max_length=GALLERY_NAME_MAX_LENGTH, description="Custom name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")
    public_sort_by: GalleryPhotoSortBy = Field(
        GalleryPhotoSortBy(PUBLIC_GALLERY_SORT_BY_DEFAULT),
        description="Default sort field for shared/public gallery",
    )
    public_sort_order: SortOrder = Field(
        SortOrder(PUBLIC_GALLERY_SORT_ORDER_DEFAULT),
        description="Default sort direction for shared/public gallery",
    )


class GalleryUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=GALLERY_NAME_MAX_LENGTH, description="New name for the gallery")
    shooting_date: date | None = Field(None, description="Displayed shooting date (YYYY-MM-DD)")
    public_sort_by: GalleryPhotoSortBy | None = Field(None, description="Default sort field for shared/public gallery")
    public_sort_order: SortOrder | None = Field(None, description="Default sort direction for shared/public gallery")

    @model_validator(mode="after")
    def validate_payload(self) -> Self:
        if self.name is None and self.shooting_date is None and self.public_sort_by is None and self.public_sort_order is None:
            raise ValueError("At least one field must be provided for update")
        return self


class GalleryResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    shooting_date: date
    public_sort_by: GalleryPhotoSortBy = Field(..., description="Default sort field for shared/public gallery")
    public_sort_order: SortOrder = Field(..., description="Default sort direction for shared/public gallery")
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")


class GalleryDetailResponse(BaseModel):
    id: str
    owner_id: str
    name: str = Field("", description="Custom name for the gallery")
    created_at: datetime
    shooting_date: date
    public_sort_by: GalleryPhotoSortBy = Field(..., description="Default sort field for shared/public gallery")
    public_sort_order: SortOrder = Field(..., description="Default sort direction for shared/public gallery")
    cover_photo_id: str | None = Field(None, description="Optional cover photo id")
    photos: list[GalleryPhotoResponse]
    total_photos: int = Field(..., description="Total number of photos in the gallery")
    total_size_bytes: int = Field(..., description="Total size of photos in bytes")


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
