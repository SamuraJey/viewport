import uuid
from dataclasses import dataclass

from sqlalchemy import func, select

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus


@dataclass(frozen=True)
class GalleryPhotoStats:
    photo_count: int
    total_size_bytes: int


def gallery_photo_stats_stmt(gallery_id: uuid.UUID, *, status: PhotoUploadStatus | None = None):
    """Build the canonical count/source-byte stats query for an active gallery."""
    conditions = [Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)]
    if status is not None:
        conditions.append(Photo.status == status)
    return (
        select(
            func.count(Photo.id),
            func.coalesce(func.sum(Photo.file_size), 0),
        )
        .select_from(Photo)
        .join(Photo.gallery)
        .where(*conditions)
    )


def gallery_photo_total_size_stmt(gallery_id: uuid.UUID, *, status: PhotoUploadStatus | None = None):
    """Build the canonical source-byte total query for an active gallery."""
    conditions = [Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)]
    if status is not None:
        conditions.append(Photo.status == status)
    return select(func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Photo.gallery).where(*conditions)
