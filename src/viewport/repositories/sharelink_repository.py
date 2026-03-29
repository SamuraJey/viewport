import uuid
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256

from sqlalchemy import String, and_, asc, case, cast, desc, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_analytics import ShareLinkDailyStat, ShareLinkDailyVisitor
from viewport.repositories.base_repository import BaseRepository
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder
from viewport.sharelink_utils import is_sharelink_expired


class ShareLinkRepository(BaseRepository):  # pragma: no cover # TODO tests
    @staticmethod
    def _build_public_photo_order_clauses(sort_by: GalleryPhotoSortBy, order: SortOrder):
        order_fn = asc if order == SortOrder.ASC else desc

        if sort_by == GalleryPhotoSortBy.UPLOADED_AT:
            return [order_fn(Photo.uploaded_at), order_fn(Photo.id)]

        if sort_by == GalleryPhotoSortBy.FILE_SIZE:
            return [order_fn(Photo.file_size), order_fn(Photo.id)]

        # Default: filename ordering for stable public presentation.
        return [order_fn(func.lower(Photo.display_name)), order_fn(Photo.id)]

    async def get_sharelink_by_id(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    @staticmethod
    def _is_expired(sharelink: ShareLink) -> bool:
        return is_sharelink_expired(sharelink.expires_at)

    async def get_valid_sharelink(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        """Get sharelink with eager loading of gallery and gallery.owner to avoid lazy loading issues."""
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id).options(selectinload(ShareLink.gallery).selectinload(Gallery.owner))
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        await self._finish_read(None)
        if not sharelink:
            return None
        if not sharelink.is_active:
            return None
        if self._is_expired(sharelink):
            return None
        return sharelink

    async def get_sharelink_for_public_access(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        """Get sharelink with gallery/owner data without filtering by active/expiry state."""
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id).options(selectinload(ShareLink.gallery).selectinload(Gallery.owner))
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        await self._finish_read(None)
        return sharelink

    async def get_sharelink_for_owner(self, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[ShareLink, str] | None:
        stmt = (
            select(ShareLink, Gallery.name)
            .join(ShareLink.gallery)
            .where(
                ShareLink.id == sharelink_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
        )
        row = (await self.db.execute(stmt)).one_or_none()
        return await self._finish_read(row)

    async def get_sharelinks_by_owner(self, owner_id: uuid.UUID, page: int, size: int, search: str | None = None) -> tuple[list[tuple[ShareLink, str]], int, dict[str, int]]:
        filters = [Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False)]
        normalized_search = (search or "").strip()
        if normalized_search:
            pattern = f"%{normalized_search}%"
            filters.append(
                or_(
                    ShareLink.label.ilike(pattern),
                    Gallery.name.ilike(pattern),
                    cast(ShareLink.id, String).ilike(pattern),
                )
            )

        count_stmt = select(func.count()).select_from(ShareLink).join(ShareLink.gallery).where(*filters)
        total = int((await self.db.execute(count_stmt)).scalar() or 0)

        now = datetime.now(UTC).replace(tzinfo=None)
        summary_stmt = (
            select(
                func.coalesce(func.sum(ShareLink.views), 0),
                func.coalesce(func.sum(ShareLink.zip_downloads), 0),
                func.coalesce(func.sum(ShareLink.single_downloads), 0),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    ShareLink.is_active.is_(True),
                                    or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .select_from(ShareLink)
            .join(ShareLink.gallery)
            .where(*filters)
        )
        summary_row = (await self.db.execute(summary_stmt)).one()
        summary = {
            "views": int(summary_row[0] or 0),
            "zip_downloads": int(summary_row[1] or 0),
            "single_downloads": int(summary_row[2] or 0),
            "active_links": int(summary_row[3] or 0),
        }

        stmt = select(ShareLink, Gallery.name).join(ShareLink.gallery).where(*filters).order_by(ShareLink.created_at.desc()).offset((page - 1) * size).limit(size)
        rows = list((await self.db.execute(stmt)).all())
        return await self._finish_read((rows, total, summary))

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

    @staticmethod
    def build_visitor_hash(ip_address: str | None, user_agent: str | None) -> str | None:
        normalized_ip = (ip_address or "").strip()
        normalized_agent = (user_agent or "").strip()
        if not normalized_ip and not normalized_agent:
            return None
        payload = f"{normalized_ip}|{normalized_agent}".encode()
        return sha256(payload).hexdigest()

    async def _upsert_daily_stat(
        self,
        sharelink_id: uuid.UUID,
        *,
        day: date,
        views_total_inc: int = 0,
        views_unique_inc: int = 0,
        zip_downloads_inc: int = 0,
        single_downloads_inc: int = 0,
    ) -> None:
        now = datetime.now(UTC)
        stmt = (
            pg_insert(ShareLinkDailyStat)
            .values(
                sharelink_id=sharelink_id,
                day=day,
                views_total=views_total_inc,
                views_unique=views_unique_inc,
                zip_downloads=zip_downloads_inc,
                single_downloads=single_downloads_inc,
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=[ShareLinkDailyStat.sharelink_id, ShareLinkDailyStat.day],
                set_={
                    "views_total": ShareLinkDailyStat.views_total + views_total_inc,
                    "views_unique": ShareLinkDailyStat.views_unique + views_unique_inc,
                    "zip_downloads": ShareLinkDailyStat.zip_downloads + zip_downloads_inc,
                    "single_downloads": ShareLinkDailyStat.single_downloads + single_downloads_inc,
                    "updated_at": now,
                },
            )
        )
        await self.db.execute(stmt)

    async def record_view(self, sharelink_id: uuid.UUID, ip_address: str | None, user_agent: str | None) -> None:
        today = datetime.now(UTC).date()
        visitor_hash = self.build_visitor_hash(ip_address, user_agent)

        is_unique = False
        if visitor_hash:
            visitor_stmt = (
                pg_insert(ShareLinkDailyVisitor)
                .values(sharelink_id=sharelink_id, day=today, visitor_hash=visitor_hash)
                .on_conflict_do_nothing(
                    index_elements=[
                        ShareLinkDailyVisitor.sharelink_id,
                        ShareLinkDailyVisitor.day,
                        ShareLinkDailyVisitor.visitor_hash,
                    ]
                )
            )
            inserted = await self.db.execute(visitor_stmt)
            is_unique = bool(inserted.rowcount)

        await self.db.execute(update(ShareLink).where(ShareLink.id == sharelink_id).values(views=ShareLink.views + 1))
        await self._upsert_daily_stat(
            sharelink_id,
            day=today,
            views_total_inc=1,
            views_unique_inc=1 if is_unique else 0,
        )
        await self.db.commit()

    async def record_zip_download(self, sharelink_id: uuid.UUID) -> None:
        today = datetime.now(UTC).date()
        await self.db.execute(update(ShareLink).where(ShareLink.id == sharelink_id).values(zip_downloads=ShareLink.zip_downloads + 1))
        await self._upsert_daily_stat(sharelink_id, day=today, zip_downloads_inc=1)
        await self.db.commit()

    async def record_single_download(self, sharelink_id: uuid.UUID) -> None:
        today = datetime.now(UTC).date()
        await self.db.execute(update(ShareLink).where(ShareLink.id == sharelink_id).values(single_downloads=ShareLink.single_downloads + 1))
        await self._upsert_daily_stat(sharelink_id, day=today, single_downloads_inc=1)
        await self.db.commit()

    async def get_sharelink_daily_stats(self, sharelink_id: uuid.UUID, *, days: int) -> list[ShareLinkDailyStat]:
        since_day = datetime.now(UTC).date() - timedelta(days=days - 1)
        stmt = select(ShareLinkDailyStat).where(ShareLinkDailyStat.sharelink_id == sharelink_id, ShareLinkDailyStat.day >= since_day).order_by(ShareLinkDailyStat.day.asc())
        rows = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(rows)
