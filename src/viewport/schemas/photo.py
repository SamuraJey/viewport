import asyncio
from collections.abc import Mapping
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from viewport.models.gallery import Photo
    from viewport.s3_service import AsyncS3Client


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

    @staticmethod
    def _build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
        safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
        return f'{disposition_type}; filename="{safe_filename}"'

    @staticmethod
    def _resolve_filename(photo: "Photo") -> str:
        display_name = getattr(photo, "display_name", None)
        if isinstance(display_name, str) and display_name:
            return display_name
        object_key = str(getattr(photo, "object_key", ""))
        if "/" in object_key:
            return object_key.split("/", 1)[1]
        return object_key or "file"

    @classmethod
    async def from_db_photo(cls, photo: "Photo", s3_client: AsyncS3Client) -> "PhotoResponse":
        """Create PhotoResponse from database Photo model with presigned URL

        Args:
            photo: Photo database model
            s3_client: AsyncS3Client instance

        Returns:
            PhotoResponse with presigned URLs
        """
        # Generate presigned URL directly for S3 access (2 hour expiration)
        filename = cls._resolve_filename(photo)
        presigned_url, thumbnail_url = await asyncio.gather(
            s3_client.generate_presigned_url_async(
                photo.object_key,
                expires_in=7200,
                response_content_disposition=cls._build_content_disposition(filename, disposition_type="inline"),
            ),
            s3_client.generate_presigned_url_async(photo.thumbnail_object_key, expires_in=7200),
        )

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
    async def from_db_photos_batch(cls, photos: list["Photo"], s3_client: AsyncS3Client) -> list["PhotoResponse"]:
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

        # Batch thumbnail URLs and original URLs separately because originals carry per-file Content-Disposition.
        thumbnail_keys = [photo.thumbnail_object_key for photo in photos]
        original_key_dispositions: Mapping[str, str | None] = {photo.object_key: cls._build_content_disposition(cls._resolve_filename(photo), disposition_type="inline") for photo in photos}

        thumbnail_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys, expires_in=7200)
        full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(original_key_dispositions, expires_in=7200)

        # Build PhotoResponse objects
        results = []
        for photo in photos:
            filename = cls._resolve_filename(photo)
            results.append(
                cls(
                    id=photo.id,
                    gallery_id=photo.gallery_id,
                    url=full_url_map.get(photo.object_key, ""),
                    thumbnail_url=thumbnail_url_map.get(photo.thumbnail_object_key, ""),
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


class PhotoUploadIntentRequest(BaseModel):
    """Request to initiate photo upload via presigned URL"""

    filename: str = Field(..., min_length=1, max_length=255)
    file_size: int = Field(..., gt=0)
    content_type: str = Field(..., pattern=r"^image/(jpeg|jpg|png)$")


class PresignedUploadData(BaseModel):
    """Presigned PUT data for S3 upload"""

    url: str
    headers: dict[str, str]


class PhotoUploadIntentResponse(BaseModel):
    """Response with photo_id and presigned upload data"""

    photo_id: UUID
    presigned_data: PresignedUploadData
    expires_in: int  # seconds


class PhotoConfirmUploadRequest(BaseModel):
    """Request to confirm photo upload"""

    photo_id: UUID


class PhotoConfirmUploadResponse(BaseModel):
    """Response for photo upload confirmation"""

    status: str  # 'confirmed' or 'already_processed'


class BatchPresignedUploadItem(BaseModel):
    """Result for a single file inside the batch presigned response"""

    filename: str
    file_size: int
    success: bool
    error: str | None = None
    photo_id: UUID | None = None
    presigned_data: PresignedUploadData | None = None
    expires_in: int | None = None


class BatchPresignedUploadsRequest(BaseModel):
    """Request for batch presigned URLs"""

    files: list[PhotoUploadIntentRequest] = Field(..., min_length=1, max_length=100)


class BatchPresignedUploadsResponse(BaseModel):
    """Response with batch presigned URLs"""

    items: list[BatchPresignedUploadItem]


class ConfirmPhotoUploadItem(BaseModel):
    """Single item in batch confirm upload request"""

    photo_id: UUID
    success: bool = True


class BatchConfirmUploadRequest(BaseModel):
    """Request to confirm multiple photo uploads"""

    items: list[ConfirmPhotoUploadItem] = Field(..., min_length=1, max_length=100)


class BatchConfirmUploadResponse(BaseModel):
    """Response for batch upload confirmation"""

    confirmed_count: int
    failed_count: int
