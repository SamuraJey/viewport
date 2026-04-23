from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH
from viewport.schemas.gallery import ProjectVisibility


class ProjectCreateRequest(BaseModel):
    name: str = Field("", max_length=GALLERY_NAME_MAX_LENGTH, description="Project name")
    shooting_date: date | None = Field(None, description="Displayed project date (YYYY-MM-DD)")


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=GALLERY_NAME_MAX_LENGTH, description="Updated project name")
    shooting_date: date | None = Field(None, description="Updated project date (YYYY-MM-DD)")

    @model_validator(mode="after")
    def validate_payload(self) -> Self:
        if self.name is None and self.shooting_date is None:
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
    recent_photo_thumbnail_urls: list[str] = Field(default_factory=list)


class ProjectResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    created_at: datetime
    shooting_date: date
    gallery_count: int = 0
    visible_gallery_count: int = 0
    entry_gallery_id: str | None = None
    entry_gallery_name: str | None = None
    has_entry_gallery: bool = False
    total_photo_count: int = 0
    total_size_bytes: int = 0
    has_active_share_links: bool = False
    cover_photo_thumbnail_url: str | None = None


class ProjectDetailResponse(ProjectResponse):
    galleries: list[ProjectGallerySummaryResponse] = Field(default_factory=list)


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
    page: int
    size: int
