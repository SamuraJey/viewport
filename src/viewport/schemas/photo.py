from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    def from_db_photo(cls, photo, s3_client) -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL

        Args:
            photo: Photo database model
            s3_client: AsyncS3Client instance

        Returns:
            PhotoResponse with presigned URLs
        """
        # Generate presigned URL directly for S3 access
        presigned_url = s3_client.generate_presigned_url(photo.object_key, expires_in=3600)  # 1 hour expiration
        thumbnail_url = s3_client.generate_presigned_url(photo.thumbnail_object_key, expires_in=3600)  # 1 hour expiration
        # Extract filename from object_key (format: gallery_id/filename)
        filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key

        return cls(
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

    @classmethod
    async def from_db_photos_batch(cls, photos: list, s3_client) -> list["PhotoResponse"]:
        """Create PhotoResponse list from database Photo models with batched presigned URLs

        This is much faster than calling from_db_photo for each photo individually,
        especially for large numbers of photos (e.g., 800 photos: ~5s -> ~0.5s)

        Args:
            photos: List of Photo database models
            s3_client: AsyncS3Client instance

        Returns:
            List of PhotoResponse objects with presigned URLs
        """
        if not photos:
            return []

        # Collect all object keys (original + thumbnail for each photo)
        object_keys = []
        for photo in photos:
            object_keys.append(photo.object_key)
            object_keys.append(photo.thumbnail_object_key)

        # Generate all presigned URLs concurrently (in batches if needed)
        url_map = await s3_client.generate_presigned_urls_batch(object_keys, expires_in=3600)

        # Build PhotoResponse objects
        results = []
        for photo in photos:
            filename = photo.object_key.split("/", 1)[1] if "/" in photo.object_key else photo.object_key

            results.append(
                cls(
                    id=photo.id,
                    gallery_id=photo.gallery_id,
                    url=url_map.get(photo.object_key, ""),
                    thumbnail_url=url_map.get(photo.thumbnail_object_key, ""),
                    filename=filename,
                    width=photo.width,
                    height=photo.height,
                    file_size=photo.file_size,
                    uploaded_at=photo.uploaded_at,
                )
            )

        return results


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
    metadata_: dict | None = Field(default=None, exclude=True)  # Internal metadata for processing, not serialized


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
