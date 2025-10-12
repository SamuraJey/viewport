from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.viewport.minio_utils import generate_presigned_url

if TYPE_CHECKING:
    from viewport.models.gallery import Photo


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
    def from_db_photo(cls, photo: "Photo") -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL"""
        # Generate presigned URL directly for S3 access (24 hour expiration for better caching)
        presigned_url = generate_presigned_url(photo.object_key, expires_in=86400)  # 24 hours
        thumbnail_url = generate_presigned_url(photo.thumbnail_object_key, expires_in=86400)  # 24 hours
        # Extract filename from object_key (format: gallery_id/filename)
        filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key

        # Use width/height from database (already extracted during upload)
        # No need to fetch from S3 metadata - much faster!
        width = photo.width
        height = photo.height

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

    @classmethod
    async def from_db_photos_batch(cls, photos: list["Photo"]) -> list["PhotoResponse"]:
        """Create PhotoResponse list from database Photo models with batch presigned URL generation

        This is significantly faster than calling from_db_photo in a loop because:
        - Presigned URLs are generated in parallel using ThreadPoolExecutor (50 workers)
        - Cache is checked first before generating new URLs
        - No S3 metadata calls (width/height already in database)
        - 24-hour TTL for better cache hit rate
        """
        if not photos:
            return []

        from src.viewport.minio_utils import generate_presigned_urls_batch

        # Extract all object keys that need presigned URLs
        object_keys = []
        for photo in photos:
            object_keys.append(photo.object_key)
            object_keys.append(photo.thumbnail_object_key)

        # Generate all presigned URLs in parallel with cache support (24 hour TTL)
        urls = generate_presigned_urls_batch(object_keys, expires_in=86400)

        # Build responses using the pre-generated URLs
        responses = []
        for i, photo in enumerate(photos):
            url_idx = i * 2
            presigned_url = urls[url_idx]
            thumbnail_url = urls[url_idx + 1]
            filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key

            responses.append(
                cls(
                    id=photo.id,
                    gallery_id=photo.gallery_id,
                    url=presigned_url,
                    thumbnail_url=thumbnail_url,
                    filename=filename,
                    width=photo.width,
                    height=photo.height,
                    file_size=photo.file_size,
                    uploaded_at=photo.uploaded_at,
                )
            )

        return responses


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
