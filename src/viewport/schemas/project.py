from datetime import date, datetime
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH
from viewport.schemas.gallery import CoverDisplayOption, GalleryPhotoResponse, PhotoSpacing, ProjectVisibility, PublicColorScheme, SortOrder


class ProjectListSortBy(StrEnum):
    MANUAL_ORDER = "manual_order"
    CREATED_AT = "created_at"
    SHOOTING_DATE = "shooting_date"
    NAME = "name"
    PHOTO_COUNT = "photo_count"
    TOTAL_SIZE_BYTES = "total_size_bytes"


class ProjectListQueryParams(BaseModel):
    search: str | None = Field(None, max_length=GALLERY_NAME_MAX_LENGTH, description="Case-insensitive partial project name search")
    sort_by: ProjectListSortBy = Field(ProjectListSortBy.CREATED_AT, description="Project sorting field")
    order: SortOrder = Field(SortOrder.DESC, description="Sort direction")

    @field_validator("search")
    @classmethod
    def normalize_search(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ProjectCreateRequest(BaseModel):
    name: str = Field("", max_length=GALLERY_NAME_MAX_LENGTH, description="Project name")
    shooting_date: date | None = Field(None, description="Displayed project date (YYYY-MM-DD)")


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=GALLERY_NAME_MAX_LENGTH, description="Updated project name")
    shooting_date: date | None = Field(None, description="Updated project date (YYYY-MM-DD)")
    cover_photo_id: str | None = Field(None, description="Optional cover photo id from any gallery of this project; null clears the explicit cover")
    cover_focal_x: float | None = Field(None, ge=0, le=100, description="Cover focal point x percentage")
    cover_focal_y: float | None = Field(None, ge=0, le=100, description="Cover focal point y percentage")
    cover_display_option: CoverDisplayOption | None = Field(None, description="Public cover composition")
    public_photo_spacing: PhotoSpacing | None = Field(None, description="Spacing between public gallery photos")
    public_color_scheme: PublicColorScheme | None = Field(None, description="Public gallery color scheme")

    @model_validator(mode="after")
    def validate_payload(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for update")
        return self


class ProjectGalleryReorderRequest(BaseModel):
    gallery_ids: list[str] = Field(..., min_length=1, description="Ordered gallery ids for the project")

    @field_validator("gallery_ids")
    @classmethod
    def validate_gallery_ids(cls, value: list[str]) -> list[str]:
        normalized = [gallery_id.strip() for gallery_id in value if gallery_id.strip()]
        if len(normalized) != len(value):
            raise ValueError("Gallery ids cannot be empty")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Gallery ids must be unique")
        return normalized


class ProjectReorderRequest(BaseModel):
    project_ids: list[str] = Field(..., min_length=1, description="Project ids in their desired relative order")

    @field_validator("project_ids")
    @classmethod
    def validate_project_ids(cls, value: list[str]) -> list[str]:
        normalized = [project_id.strip() for project_id in value if project_id.strip()]
        if len(normalized) != len(value):
            raise ValueError("Project ids cannot be empty")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Project ids must be unique")
        return normalized


class ProjectGallerySummaryResponse(BaseModel):
    id: str
    owner_id: str
    project_id: str | None = None
    project_name: str | None = None
    project_position: int = 0
    project_visibility: ProjectVisibility = ProjectVisibility.LISTED
    name: str
    created_at: datetime
    shooting_date: date
    cover_photo_id: str | None = None
    photo_count: int = 0
    total_size_bytes: int = 0
    has_active_share_links: bool = False
    cover_photo_thumbnail_url: str | None = None


class ProjectResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    created_at: datetime
    shooting_date: date
    manual_order: int = 0
    gallery_count: int = 0
    visible_gallery_count: int = 0
    entry_gallery_id: str | None = None
    entry_gallery_name: str | None = None
    has_entry_gallery: bool = False
    total_photo_count: int = 0
    total_size_bytes: int = 0
    has_active_share_links: bool = False
    active_share_link_count: int = 0
    latest_share_link_id: str | None = None
    active_viewers_count: int = 0
    last_activity_at: datetime
    cover_photo_thumbnail_url: str | None = None
    preview_thumbnail_urls: list[str] = Field(default_factory=list, max_length=4)
    cover_photo_id: str | None = None
    cover_focal_x: float = Field(50.0, ge=0, le=100)
    cover_focal_y: float = Field(50.0, ge=0, le=100)
    cover_display_option: CoverDisplayOption = Field(CoverDisplayOption.CENTERED_TITLE)
    public_photo_spacing: PhotoSpacing = Field(PhotoSpacing.MEDIUM)
    public_color_scheme: PublicColorScheme = Field(PublicColorScheme.LIGHT)


class ProjectPhotosResponse(BaseModel):
    photos: list[GalleryPhotoResponse]
    total: int


class ProjectDetailResponse(ProjectResponse):
    galleries: list[ProjectGallerySummaryResponse] = Field(default_factory=list)


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
    page: int
    size: int
