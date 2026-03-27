import uuid
from datetime import UTC, datetime

from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.orm import selectinload

from viewport.models.gallery import Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.base_repository import BaseRepository
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder


class ShareLinkRepository(BaseRepository):  # pragma: no cover # TODO tests
    @staticmethod
    def _build_public_photo_order_clauses(sort_by: GalleryPhotoSortBy, order: SortOrder):
        order_fn = asc if order == SortOrder.ASC else desc

        if sort_by == GalleryPhotoSortBy.CREATED_AT:
            return [order_fn(Photo.uploaded_at), order_fn(Photo.id)]

        if sort_by == GalleryPhotoSortBy.FILE_SIZE:
            return [order_fn(Photo.file_size), order_fn(Photo.id)]

        # Default: filename ordering for stable public presentation.
        return [order_fn(func.lower(Photo.display_name)), order_fn(Photo.id)]

    async def get_sharelink_by_id(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    async def get_valid_sharelink(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        """Get sharelink with eager loading of gallery and gallery.owner to avoid lazy loading issues."""
        from viewport.models.gallery import Gallery

        stmt = select(ShareLink).where(ShareLink.id == sharelink_id).options(selectinload(ShareLink.gallery).selectinload(Gallery.owner))
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        await self._finish_read(None)
        if not sharelink:
            return None
        if sharelink.expires_at and sharelink.expires_at.timestamp() < datetime.now(UTC).timestamp():
            return None
        return sharelink

    async def get_photo_count_by_gallery(self, gallery_id: uuid.UUID) -> int:
        from viewport.models.gallery import Gallery

        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_photos_by_gallery_id(
        self,
        gallery_id: uuid.UUID,
        limit: int | None = None,
        offset: int = 0,
        sort_by: GalleryPhotoSortBy = GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order: SortOrder = SortOrder.ASC,
    ) -> list[Photo]:
        from viewport.models.gallery import Gallery

        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)).order_by(*self._build_public_photo_order_clauses(sort_by, order)).offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)

        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        from viewport.models.gallery import Gallery

        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        photo = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(photo)

    async def increment_views(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(views=ShareLink.views + 1)
        await self.db.execute(stmt)
        await self.db.commit()

    async def increment_zip_downloads(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(zip_downloads=ShareLink.zip_downloads + 1)
        await self.db.execute(stmt)
        await self.db.commit()

    async def increment_single_downloads(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(single_downloads=ShareLink.single_downloads + 1)
        await self.db.execute(stmt)
        await self.db.commit()
