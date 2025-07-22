from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PhotoCreateRequest(BaseModel):
    file_size: int = Field(..., ge=1)
    # file will be handled as UploadFile in endpoint, not in schema


class PhotoResponse(BaseModel):
    id: UUID
    gallery_id: UUID
    url_s3: str
    file_size: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class PhotoListResponse(BaseModel):
    photos: list[PhotoResponse]
    total: int
    page: int
    size: int
