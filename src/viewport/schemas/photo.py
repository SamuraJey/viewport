import asyncio
from collections.abc import Mapping
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from viewport.filename_utils import build_content_disposition, resolve_photo_filename

PHOTO_ID_BATCH_MAX = 500

if TYPE_CHECKING:
    from viewport.models.gallery import Photo
    from viewport.s3_service import AsyncS3Client


MediaType = Literal["image", "video"]
MediaStatus = Literal["pending", "processing", "successful", "failed"]


def _status_to_str(status: int) -> MediaStatus:
    """Map PhotoUploadStatus integer to MediaStatus string."""
    _status_map: dict[int, MediaStatus] = {
        1: "pending",
        2: "successful",
        3: "failed",
        4: "processing",
    }
    return _status_map.get(status, "pending")


class PhotoCreateRequest(BaseModel):
    file_size: int = Field(..., ge=1)
    # file will be handled as UploadFile in endpoint, not in schema


async def _generate_url_maps(
    photos: list["Photo"],
    s3_client: "AsyncS3Client",
) -> tuple[Mapping[str, str], Mapping[str, str], Mapping[str, str]]:
    """Generate presigned URL maps for thumbnail, original, and playback keys.

    Returns (thumbnail_url_map, full_url_map, playback_url_map).
    """
    thumbnail_keys = [photo.thumbnail_object_key for photo in photos]
    original_key_dispositions: Mapping[str, str | None] = {
        photo.object_key: build_content_disposition(
            resolve_photo_filename(photo),
            disposition_type="inline",
        )
        for photo in photos
    }
    playback_keys = [photo.playback_object_key for photo in photos if photo.playback_object_key]

    thumbnail_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys, expires_in=7200)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(
        original_key_dispositions,
        expires_in=7200,
    )
    playback_url_map = await s3_client.generate_presigned_urls_batch(playback_keys, expires_in=7200) if playback_keys else {}
    return thumbnail_url_map, full_url_map, playback_url_map


def _build_photo_response_payload(
    photo: "Photo",
    full_url_map: Mapping[str, str],
    thumbnail_url_map: Mapping[str, str],
    playback_url_map: Mapping[str, str],
    *,
    include_gallery_id: bool,
) -> dict[str, Any]:
    media_type: MediaType = cast(MediaType, photo.media_type)
    if media_type == "video":
        playback_key = photo.playback_object_key
        url = playback_url_map.get(playback_key, "") if playback_key else full_url_map.get(photo.object_key, "")
        playback_url = url if playback_key else None
    else:
        url = full_url_map.get(photo.object_key, "")
        playback_url = None

    payload: dict[str, Any] = {
        "id": photo.id,
        "media_type": media_type,
        "url": url,
        "thumbnail_url": thumbnail_url_map.get(photo.thumbnail_object_key, ""),
        "playback_url": playback_url,
        "duration_ms": photo.duration_ms,
        "width": photo.width,
        "height": photo.height,
        "status": _status_to_str(photo.status),
        "processing_error": photo.processing_error,
        "filename": resolve_photo_filename(photo),
        "file_size": photo.file_size,
        "uploaded_at": photo.uploaded_at,
    }
    if include_gallery_id:
        payload["gallery_id"] = photo.gallery_id
    return payload


class PhotoResponse(BaseModel):
    id: UUID
    gallery_id: UUID
    media_type: MediaType
    url: str
    thumbnail_url: str
    playback_url: str | None = None
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    status: MediaStatus
    processing_error: str | None = None
    filename: str
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @staticmethod
    def _build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
        return build_content_disposition(filename, disposition_type)

    @staticmethod
    def _resolve_filename(photo: "Photo") -> str:
        return resolve_photo_filename(photo)

    @classmethod
    async def from_db_photo(cls, photo: "Photo", s3_client: "AsyncS3Client") -> "PhotoResponse":
        filename = cls._resolve_filename(photo)
        media_type: MediaType = cast(MediaType, photo.media_type)

        tasks: list = [
            s3_client.generate_presigned_url_async(
                photo.object_key,
                expires_in=7200,
                response_content_disposition=cls._build_content_disposition(
                    filename,
                    disposition_type="inline",
                ),
            ),
            s3_client.generate_presigned_url_async(photo.thumbnail_object_key, expires_in=7200),
        ]

        if media_type == "video" and photo.playback_object_key:
            tasks.append(
                s3_client.generate_presigned_url_async(photo.playback_object_key, expires_in=7200),
            )

        results = await asyncio.gather(*tasks)
        presigned_url = results[0]
        thumbnail_url = results[1]

        if media_type == "video" and photo.playback_object_key:
            url: str = results[2]
            playback_url: str | None = results[2]
        else:
            url = presigned_url
            playback_url = None

        return cls(
            id=photo.id,
            gallery_id=photo.gallery_id,
            media_type=media_type,
            url=url,
            thumbnail_url=thumbnail_url,
            playback_url=playback_url,
            duration_ms=photo.duration_ms,
            width=photo.width,
            height=photo.height,
            status=_status_to_str(photo.status),
            processing_error=photo.processing_error,
            filename=filename,
            file_size=photo.file_size,
            uploaded_at=photo.uploaded_at,
        )

    @classmethod
    async def from_db_photos_batch(
        cls,
        photos: list["Photo"],
        s3_client: "AsyncS3Client",
    ) -> list["PhotoResponse"]:
        if not photos:
            return []

        thumbnail_url_map, full_url_map, playback_url_map = await _generate_url_maps(photos, s3_client)
        return [
            cls(
                **_build_photo_response_payload(
                    photo,
                    full_url_map,
                    thumbnail_url_map,
                    playback_url_map,
                    include_gallery_id=True,
                )
            )
            for photo in photos
        ]


class GalleryPhotoResponse(BaseModel):
    id: UUID
    media_type: MediaType
    url: str
    thumbnail_url: str
    playback_url: str | None = None
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    status: MediaStatus
    processing_error: str | None = None
    filename: str
    file_size: int
    uploaded_at: datetime

    @classmethod
    async def from_db_photos_batch(
        cls,
        photos: list["Photo"],
        s3_client: "AsyncS3Client",
    ) -> list["GalleryPhotoResponse"]:
        if not photos:
            return []

        thumbnail_url_map, full_url_map, playback_url_map = await _generate_url_maps(photos, s3_client)
        return [
            cls(
                **_build_photo_response_payload(
                    photo,
                    full_url_map,
                    thumbnail_url_map,
                    playback_url_map,
                    include_gallery_id=False,
                )
            )
            for photo in photos
        ]


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
    content_type: str = Field(..., pattern=r"^(image/(jpeg|jpg|png)|video/(mp4|quicktime|x-m4v|webm|x-matroska|x-msvideo|mpeg|mpg|3gpp))$")


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
    upload_mode: Literal["single", "multipart"] = "single"
    upload_id: str | None = None
    part_size: int | None = None
    presigned_urls: list[str] | None = None
    expected_total_size: int | None = None
    presigned_data: PresignedUploadData | None = None
    expires_in: int | None = None


class BatchPresignedUploadsRequest(BaseModel):
    """Request for batch presigned URLs"""

    files: list[PhotoUploadIntentRequest] = Field(..., min_length=1, max_length=100)


class BatchPresignedUploadsResponse(BaseModel):
    """Response with batch presigned URLs"""

    items: list[BatchPresignedUploadItem]


class ConfirmPhotoUploadItem(BaseModel):
    photo_id: UUID
    success: bool = True


class BatchConfirmUploadRequest(BaseModel):
    items: list[ConfirmPhotoUploadItem] = Field(..., min_length=1, max_length=100)


class BatchConfirmUploadResponse(BaseModel):
    confirmed_count: int
    failed_count: int


class CompleteMultipartUploadRequest(BaseModel):
    """Request to complete a multipart upload"""

    upload_id: str
    parts: list[dict[str, Any]]  # Each has ETag and PartNumber


class AbortMultipartUploadRequest(BaseModel):
    """Request to abort a multipart upload"""

    upload_id: str


class BatchDeletePhotosRequest(BaseModel):
    photo_ids: list[UUID] = Field(..., min_length=1, max_length=PHOTO_ID_BATCH_MAX)

    @model_validator(mode="after")
    def deduplicate_photo_ids(self) -> "BatchDeletePhotosRequest":
        self.photo_ids = list(dict.fromkeys(self.photo_ids))
        return self


class BatchDeletePhotosResponse(BaseModel):
    requested_count: int
    deleted_ids: list[UUID]
    not_found_ids: list[UUID]
    failed_ids: list[UUID]


class DownloadSelectedPhotosRequest(BaseModel):
    photo_ids: list[UUID] = Field(..., min_length=1, max_length=PHOTO_ID_BATCH_MAX)
