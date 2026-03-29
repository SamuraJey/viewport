from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ShareLinkBase(BaseModel):
    label: str | None = Field(None, max_length=127)
    expires_at: datetime | None = None
    is_active: bool = True


class ShareLinkCreateRequest(ShareLinkBase):
    pass


class ShareLinkUpdateRequest(BaseModel):
    label: str | None = Field(None, max_length=127)
    expires_at: datetime | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for update")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class GalleryShareLinkResponse(ShareLinkBase):
    id: UUID
    views: int
    zip_downloads: int
    single_downloads: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ShareLinkResponse(GalleryShareLinkResponse):
    gallery_id: UUID


class ShareLinkDashboardItemResponse(ShareLinkResponse):
    gallery_name: str


class ShareLinkDashboardSummaryResponse(BaseModel):
    views: int
    zip_downloads: int
    single_downloads: int
    active_links: int


class ShareLinkDashboardResponse(BaseModel):
    share_links: list[ShareLinkDashboardItemResponse]
    total: int
    page: int
    size: int
    summary: ShareLinkDashboardSummaryResponse


class ShareLinkDailyPointResponse(BaseModel):
    day: date
    views_total: int
    views_unique: int
    zip_downloads: int
    single_downloads: int


class ShareLinkAnalyticsResponse(BaseModel):
    share_link: ShareLinkDashboardItemResponse
    points: list[ShareLinkDailyPointResponse]
