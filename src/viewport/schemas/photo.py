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
    thumbnail_url: str
    filename: str
    width: int | None = None
    height: int | None = None
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_db_photo(cls, photo) -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL"""
        # Generate presigned URL directly for S3 access
        presigned_url = generate_presigned_url(photo.object_key, expires_in=3600)  # 1 hour expiration
        thumbnail_url = generate_presigned_url(photo.thumbnail_object_key, expires_in=3600)  # 1 hour expiration
        # Extract filename from object_key (format: gallery_id/filename)
        filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key
        # Attempt to read metadata (width/height) from S3 object metadata if available
        try:
            from src.viewport.minio_utils import get_object_metadata

            meta = get_object_metadata(photo.object_key) or {}
            metadata = meta.get("Metadata", {}) if isinstance(meta, dict) else {}
            width = int(metadata.get("width")) if metadata.get("width") else None
            height = int(metadata.get("height")) if metadata.get("height") else None
        except Exception:
            width = None
            height = None

        return cls(
            id=photo.id,
            gallery_id=photo.gallery_id,
            url=presigned_url,
            thumbnail_url=thumbnail_url,
            filename=filename,
            width=width,
            height=height,
            file_size=photo.file_size,
            uploaded_at=photo.uploaded_at,
        )


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
    metadata_: dict | None = None  # Internal metadata for processing, not serialized

    model_config = ConfigDict(exclude={"metadata_"})


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


class PhotoRenameRequest(BaseModel):
    """Request model for renaming a photo"""

    filename: str = Field(..., min_length=1, max_length=255, description="New filename for the photo")
