from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ShareScopeType(StrEnum):
    GALLERY = "gallery"
    PROJECT = "project"


PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_BYTES = 72


def _validate_sharelink_password(password: str | None) -> str | None:
    if password is None:
        return None
    if not password.strip():
        raise ValueError("password cannot be blank")
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"password must be at most {PASSWORD_MAX_BYTES} UTF-8 bytes")
    return password


class ShareLinkBase(BaseModel):
    label: str | None = Field(None, max_length=127)
    expires_at: datetime | None = None
    is_active: bool = True


class ShareLinkCreateRequest(ShareLinkBase):
    password: str | None = Field(
        None,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_BYTES,
        json_schema_extra={"writeOnly": True},
    )

    @model_validator(mode="after")
    def validate_password(self):
        if "password" in self.model_fields_set:
            self.password = _validate_sharelink_password(self.password)
        return self


class ShareLinkUpdateRequest(BaseModel):
    label: str | None = Field(None, max_length=127)
    expires_at: datetime | None = None
    is_active: bool | None = None
    password: str | None = Field(
        None,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_BYTES,
        json_schema_extra={"writeOnly": True},
    )
    password_clear: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_password(cls, data: Any) -> Any:
        if isinstance(data, dict) and "password" in data and data["password"] is None:
            raise ValueError(
                "password cannot be null; omit password to leave unchanged or use password_clear to remove",
            )
        return data

    @model_validator(mode="after")
    def validate_payload(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for update")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        if "password_clear" in self.model_fields_set and self.password_clear is None:
            raise ValueError("password_clear cannot be null")
        if self.password_clear and "password" in self.model_fields_set:
            raise ValueError("password and password_clear cannot be provided together")
        if "password" in self.model_fields_set:
            self.password = _validate_sharelink_password(self.password)
        return self


class GalleryShareLinkResponse(ShareLinkBase):
    id: UUID
    scope_type: ShareScopeType = ShareScopeType.GALLERY
    views: int
    zip_downloads: int
    single_downloads: int
    has_password: bool = False
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
