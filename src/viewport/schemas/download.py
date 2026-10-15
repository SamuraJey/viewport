from enum import StrEnum

from pydantic import BaseModel, Field


class DownloadQuality(StrEnum):
    ORIGINAL = "original"
    PUBLICATION = "publication"


class DownloadEstimateResponse(BaseModel):
    image_count: int = Field(ge=0)
    video_count: int = Field(ge=0)
    available_video_count: int = Field(ge=0)
    original_size_bytes: int = Field(ge=0)
    publication_size_bytes: int | None = Field(ge=0)
    publication_pending_count: int = Field(ge=0)


class PublicationRequestResponse(BaseModel):
    requested_count: int = Field(ge=0)
    skipped_count: int = Field(ge=0)
