from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException

from viewport.filename_utils import split_name_and_ext
from viewport.models.gallery import MediaType, Photo, PhotoUploadStatus
from viewport.photo_rotation import get_photo_delivery_key, is_rotation_pending
from viewport.schemas.download import DownloadEstimateResponse, DownloadQuality
from viewport.zip_utils import build_zip_fallback_name, make_unique_zip_entry_name, sanitize_zip_entry_name


@dataclass(frozen=True, slots=True)
class DownloadEntry:
    object_key: str
    filename: str
    media_type: str


def _eligible_photos(photos: Sequence[Photo], *, include_videos: bool, block_pending_rotations: bool) -> tuple[list[Photo], int]:
    successful = [photo for photo in photos if photo.status == PhotoUploadStatus.SUCCESSFUL]
    available_video_count = sum(photo.media_type == MediaType.VIDEO.value for photo in successful)
    included = [photo for photo in successful if include_videos or photo.media_type != MediaType.VIDEO.value]
    if block_pending_rotations and any(is_rotation_pending(photo) for photo in included):
        raise HTTPException(status_code=409, detail="Photo rotations are still saving")
    return included, available_video_count


def _has_publication(photo: Photo) -> bool:
    return bool(photo.publication_object_key and photo.publication_file_size is not None and photo.publication_file_size > 0)


def prepare_download_entries(
    photos: Sequence[Photo],
    *,
    quality: DownloadQuality,
    include_videos: bool,
    block_pending_rotations: bool,
    gallery_names: Mapping[UUID, str] | None = None,
) -> list[DownloadEntry]:
    included, _ = _eligible_photos(photos, include_videos=include_videos, block_pending_rotations=block_pending_rotations)
    if not included:
        raise HTTPException(status_code=404, detail="No photos found")
    if quality == DownloadQuality.PUBLICATION and any(photo.media_type != MediaType.VIDEO.value and not _has_publication(photo) for photo in included):
        raise HTTPException(status_code=409, detail="Publication files are not ready")

    entries = []
    used_names: set[str] = set()
    for photo in included:
        is_video = photo.media_type == MediaType.VIDEO.value
        publication = quality == DownloadQuality.PUBLICATION and not is_video
        if is_video:
            key = photo.object_key
        elif publication:
            assert photo.publication_object_key is not None
            key = photo.publication_object_key
        else:
            key = get_photo_delivery_key(photo)
        filename = photo.display_name or ""
        fallback = build_zip_fallback_name(filename, object_key=key, fallback_stem=f"photo-{photo.id}")
        if publication:
            _, extension = split_name_and_ext(filename)
            stem = filename[: -len(extension)] if extension else filename
            filename = f"{stem}_publication.jpg" if stem else ""
            fallback = f"photo-{photo.id}_publication.jpg"
        if gallery_names is not None:
            gallery_name = sanitize_zip_entry_name(gallery_names[photo.gallery_id], fallback=f"gallery-{photo.gallery_id}")
            filename = f"{gallery_name} - {filename}"
            fallback = f"{gallery_name} - {fallback}"
        filename = sanitize_zip_entry_name(filename, fallback=fallback)
        entries.append(DownloadEntry(object_key=key, filename=make_unique_zip_entry_name(filename, used_names), media_type=photo.media_type))
    return entries


def build_download_estimate(photos: Sequence[Photo], *, include_videos: bool, block_pending_rotations: bool) -> DownloadEstimateResponse:
    included, available_video_count = _eligible_photos(photos, include_videos=include_videos, block_pending_rotations=block_pending_rotations)
    images = [photo for photo in included if photo.media_type != MediaType.VIDEO.value]
    videos = [photo for photo in included if photo.media_type == MediaType.VIDEO.value]
    pending_count = sum(not _has_publication(photo) for photo in images)
    return DownloadEstimateResponse(
        image_count=len(images),
        video_count=len(videos),
        available_video_count=available_video_count,
        original_size_bytes=sum(photo.file_size for photo in included),
        publication_size_bytes=None if pending_count else sum(photo.publication_file_size for photo in images if photo.publication_file_size is not None) + sum(photo.file_size for photo in videos),
        publication_pending_count=pending_count,
    )
