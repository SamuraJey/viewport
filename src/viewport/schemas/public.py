from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from viewport.schemas.gallery import CoverDisplayOption, PhotoSpacing, PublicColorScheme


class MediaType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"


class MediaStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESSFUL = "successful"
    FAILED = "failed"


class PublicShareUnlockRequest(BaseModel):
    password: str | None = None


class PublicPhoto(BaseModel):
    photo_id: str
    media_type: MediaType
    thumbnail_url: str
    full_url: str
    playback_url: str | None = None
    filename: str | None = None
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    status: MediaStatus
    processing_error: str | None = None


class MediaCover(BaseModel):
    photo_id: str
    media_type: MediaType
    thumbnail_url: str
    full_url: str
    playback_url: str | None = None
    filename: str | None = None


# Backward-compatible alias
PublicCover = MediaCover


class PublicProjectGallery(BaseModel):
    gallery_id: str
    gallery_name: str = ""
    photo_count: int = 0
    cover_thumbnail_url: str | None = None
    route_path: str
    direct_share_path: str | None = None


class PublicGalleryAppearance(BaseModel):
    cover_focal_x: float = 50.0
    cover_focal_y: float = 50.0
    cover_display_option: CoverDisplayOption = CoverDisplayOption.CENTERED_TITLE
    photo_spacing: PhotoSpacing = PhotoSpacing.MEDIUM
    color_scheme: PublicColorScheme = PublicColorScheme.LIGHT


class PublicGalleryResponse(BaseModel):
    scope_type: Literal["gallery"] = "gallery"
    photos: list[PublicPhoto]
    cover: MediaCover | None = None
    photographer: str = ""
    gallery_name: str = ""
    date: str = ""
    site_url: str = ""
    total_photos: int = 0
    total_size_bytes: int = 0
    project_id: str | None = None
    project_name: str | None = None
    parent_share_id: str | None = None
    project_navigation: "PublicProjectResponse | None" = None
    appearance: PublicGalleryAppearance = Field(default_factory=PublicGalleryAppearance)


class PublicProjectResponse(BaseModel):
    scope_type: Literal["project"] = "project"
    project_id: str
    project_name: str = ""
    photographer: str = ""
    date: str = ""
    site_url: str = ""
    cover: MediaCover | None = None
    total_listed_galleries: int = 0
    total_listed_photos: int = 0
    total_size_bytes: int = 0
    galleries: list[PublicProjectGallery] = Field(default_factory=list)
    appearance: PublicGalleryAppearance = Field(default_factory=PublicGalleryAppearance)


PublicShareResponse = Annotated[
    PublicGalleryResponse | PublicProjectResponse,
    Field(discriminator="scope_type"),
]


PublicGalleryResponse.model_rebuild()
