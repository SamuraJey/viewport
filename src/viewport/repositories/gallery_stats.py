import uuid

from sqlalchemy import func, select

from viewport.models.gallery import Gallery, Photo


def gallery_photo_total_size_stmt(gallery_id: uuid.UUID):
    """Build the canonical source-byte total query for an active gallery."""
    return select(func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
