from sqlalchemy import asc, desc, func

from viewport.models.gallery import Photo
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder


def build_photo_order_clauses(
    sort_by: GalleryPhotoSortBy,
    order: SortOrder,
    *,
    include_uploaded_at_tiebreaker: bool = True,
):
    order_fn = asc if order == SortOrder.ASC else desc

    if sort_by == GalleryPhotoSortBy.ORIGINAL_FILENAME:
        primary_column = func.lower(Photo.display_name)
        clauses = [order_fn(primary_column)]
        if include_uploaded_at_tiebreaker:
            clauses.append(order_fn(Photo.uploaded_at))
        clauses.append(order_fn(Photo.id))
        return clauses

    if sort_by == GalleryPhotoSortBy.FILE_SIZE:
        clauses = [order_fn(Photo.file_size)]
        if include_uploaded_at_tiebreaker:
            clauses.append(order_fn(Photo.uploaded_at))
        clauses.append(order_fn(Photo.id))
        return clauses

    return [order_fn(Photo.uploaded_at), order_fn(Photo.id)]
