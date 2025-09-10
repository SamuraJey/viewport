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
    filename: str
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_db_photo(cls, photo) -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL"""
        # Generate presigned URL directly for S3 access
        presigned_url = generate_presigned_url(photo.object_key, expires_in=3600)  # 1 hour expiration
        # Extract filename from object_key (format: gallery_id/filename)
        filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key
        return cls(id=photo.id, gallery_id=photo.gallery_id, url=presigned_url, filename=filename, file_size=photo.file_size, uploaded_at=photo.uploaded_at)


class PhotoListResponse(BaseModel):
    photos: list[PhotoResponse]
    total: int
    page: int
    size: int


class PhotoUploadResult(BaseModel):
    """Result of uploading a single photo"""

    filename: str
    success: bool
    error: str | None = None
    photo: PhotoResponse | None = None


class PhotoUploadResponse(BaseModel):
    """Response for batch photo upload"""

    results: list[PhotoUploadResult]
    total_files: int
    successful_uploads: int
    failed_uploads: int


class PhotoURLResponse(BaseModel):
    id: UUID
    url: str
    expires_in: int
