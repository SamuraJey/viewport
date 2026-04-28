from typing import Annotated, Literal

from pydantic import BaseModel, Field


class PublicPhoto(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str
    filename: str | None = None


class PublicCover(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str
    filename: str | None = None


class PublicProjectFolder(BaseModel):
    folder_id: str
    folder_name: str = ""
    photo_count: int = 0
    cover_thumbnail_url: str | None = None
    route_path: str
    direct_share_path: str | None = None


class PublicGalleryResponse(BaseModel):
    scope_type: Literal["gallery"] = "gallery"
    photos: list[PublicPhoto]
    cover: PublicCover | None = None
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


class PublicProjectResponse(BaseModel):
    scope_type: Literal["project"] = "project"
    project_id: str
    project_name: str = ""
    photographer: str = ""
    date: str = ""
    site_url: str = ""
    cover: PublicCover | None = None
    total_listed_folders: int = 0
    total_listed_photos: int = 0
    total_size_bytes: int = 0
    folders: list[PublicProjectFolder] = Field(default_factory=list)


PublicShareResponse = Annotated[
    PublicGalleryResponse | PublicProjectResponse,
    Field(discriminator="scope_type"),
]


PublicGalleryResponse.model_rebuild()
