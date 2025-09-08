from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.viewport.minio_utils import generate_presigned_url


class PhotoCreateRequest(BaseModel):
    file_size: int = Field(..., ge=1)
    # file will be handled as UploadFile in endpoint, not in schema


class PhotoResponse(BaseModel):
    id: UUID
    gallery_id: UUID
    url: str
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_db_photo(cls, photo) -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL"""
        # Generate presigned URL directly for S3 access
        presigned_url = generate_presigned_url(photo.object_key, expires_in=3600)  # 1 hour expiration
        return cls(id=photo.id, gallery_id=photo.gallery_id, url=presigned_url, file_size=photo.file_size, uploaded_at=photo.uploaded_at)


class PhotoListResponse(BaseModel):
    photos: list[PhotoResponse]
    total: int
    page: int
    size: int
