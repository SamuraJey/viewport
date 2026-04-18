from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ShareScopeType(StrEnum):
    GALLERY = "gallery"
    PROJECT = "project"


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
    scope_type: ShareScopeType = ShareScopeType.GALLERY
    views: int
    zip_downloads: int
    single_downloads: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ScopedShareLinkResponse(GalleryShareLinkResponse):
    gallery_id: UUID | None = None
    project_id: UUID | None = None
    selection_summary: "ShareLinkSelectionSummaryResponse | None" = None


class ShareLinkResponse(ScopedShareLinkResponse):
    pass


class ShareLinkDashboardItemResponse(ShareLinkResponse):
    gallery_name: str | None = None
    project_name: str | None = None


class ShareLinkSelectionSummaryResponse(BaseModel):
    is_enabled: bool
    status: str
    total_sessions: int
    submitted_sessions: int
    in_progress_sessions: int
    closed_sessions: int
    selected_count: int
    latest_activity_at: datetime | None


class ShareLinkDashboardListItemResponse(ShareLinkDashboardItemResponse):
    selection_summary: ShareLinkSelectionSummaryResponse | None = None


class ShareLinkDashboardSummaryResponse(BaseModel):
    views: int
    zip_downloads: int
    single_downloads: int
    active_links: int


class ShareLinkDashboardResponse(BaseModel):
    share_links: list[ShareLinkDashboardListItemResponse]
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
    selection_summary: ShareLinkSelectionSummaryResponse | None
    points: list[ShareLinkDailyPointResponse]
