import uuid
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from typing import Literal

from sqlalchemy import String, and_, case, cast, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

from viewport.models.gallery import Gallery, Photo, ProjectVisibility
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink, ShareScopeType
from viewport.models.sharelink_analytics import ShareLinkDailyStat, ShareLinkDailyVisitor
from viewport.models.sharelink_selection import ShareLinkSelectionSession
from viewport.repositories.base_repository import BaseRepository
from viewport.repositories.gallery_stats import GalleryPhotoStats, gallery_photo_stats_stmt, gallery_photo_total_size_stmt
from viewport.repositories.photo_query_helpers import build_photo_order_clauses
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder
from viewport.sharelink_utils import is_sharelink_expired

OwnerShareLinkStatus = Literal["active", "inactive", "expired"]


class ShareLinkRepository(BaseRepository):
    LIKE_ESCAPE_CHAR = "\\"

    @classmethod
    def _escape_like_term(cls, value: str) -> str:
        return value.replace(cls.LIKE_ESCAPE_CHAR, cls.LIKE_ESCAPE_CHAR * 2).replace("%", f"{cls.LIKE_ESCAPE_CHAR}%").replace("_", f"{cls.LIKE_ESCAPE_CHAR}_")

    @staticmethod
    def _owner_filter(owner_id: uuid.UUID):
        return or_(
            and_(
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            ),
            and_(
                ShareLink.scope_type == ShareScopeType.PROJECT.value,
                Project.owner_id == owner_id,
                Project.is_deleted.is_(False),
            ),
        )

    @staticmethod
    def _public_target_filter():
        return or_(
            and_(
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                Gallery.is_deleted.is_(False),
            ),
            and_(
                ShareLink.scope_type == ShareScopeType.PROJECT.value,
                Project.is_deleted.is_(False),
            ),
        )

    async def get_sharelink_by_id(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    @staticmethod
    def _is_expired(sharelink: ShareLink) -> bool:
        return is_sharelink_expired(sharelink.expires_at)

    async def get_valid_sharelink(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        sharelink = await self.get_sharelink_for_public_access(sharelink_id)
        if not sharelink:
            return None
        if not sharelink.is_active:
            return None
        if self._is_expired(sharelink):
            return None
        return sharelink

    async def get_sharelink_for_public_access(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        stmt = (
            select(ShareLink)
            .outerjoin(ShareLink.gallery)
            .outerjoin(ShareLink.project)
            .where(ShareLink.id == sharelink_id, self._public_target_filter())
            .options(
                selectinload(ShareLink.gallery).selectinload(Gallery.owner),
                selectinload(ShareLink.project).selectinload(Project.owner),
            )
        )
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        await self._finish_read(None)
        return sharelink

    async def get_sharelink_for_owner(self, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[ShareLink, str | None, str | None] | None:
        stmt = select(ShareLink, Gallery.name, Project.name).outerjoin(ShareLink.gallery).outerjoin(ShareLink.project).where(ShareLink.id == sharelink_id, self._owner_filter(owner_id))
        row = (await self.db.execute(stmt)).one_or_none()
        if row is None:
            return await self._finish_read(None)
        return await self._finish_read((row[0], row[1], row[2]))

    async def get_sharelinks_by_owner(
        self,
        owner_id: uuid.UUID,
        page: int,
        size: int,
        search: str | None = None,
        status: OwnerShareLinkStatus | None = None,
    ) -> tuple[list[tuple[ShareLink, str | None, str | None, datetime]], int, dict[str, int]]:
        filters = [self._owner_filter(owner_id)]
        now = datetime.now(UTC).replace(tzinfo=None)
        normalized_search = (search or "").strip()
        if normalized_search:
            escaped_search = self._escape_like_term(normalized_search)
            pattern = f"%{escaped_search}%"
            filters.append(
                or_(
                    ShareLink.label.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    Gallery.name.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    Project.name.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    cast(ShareLink.id, String).ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                )
            )

        if status == "active":
            filters.extend(
                [
                    ShareLink.is_active.is_(True),
                    or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
                ]
            )
        elif status == "inactive":
            filters.append(ShareLink.is_active.is_(False))
        elif status == "expired":
            filters.extend([ShareLink.is_active.is_(True), ShareLink.expires_at.is_not(None), ShareLink.expires_at <= now])

        candidate_sharelink_ids_subquery = select(ShareLink.id.label("sharelink_id")).outerjoin(ShareLink.gallery).outerjoin(ShareLink.project).where(*filters).subquery()

        session_activity_subquery = (
            select(
                ShareLinkSelectionSession.sharelink_id.label("sharelink_id"),
                func.max(ShareLinkSelectionSession.updated_at).label("latest_activity_at"),
            )
            .join(
                candidate_sharelink_ids_subquery,
                candidate_sharelink_ids_subquery.c.sharelink_id == ShareLinkSelectionSession.sharelink_id,
            )
            .group_by(ShareLinkSelectionSession.sharelink_id)
            .subquery()
        )
        latest_activity_expr = func.greatest(
            func.coalesce(session_activity_subquery.c.latest_activity_at, ShareLink.created_at),
            func.coalesce(ShareLink.updated_at, ShareLink.created_at),
            ShareLink.created_at,
        ).label("latest_activity_at")

        base_stmt = select(ShareLink).outerjoin(ShareLink.gallery).outerjoin(ShareLink.project).where(*filters)

        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total = int((await self.db.execute(count_stmt)).scalar() or 0)

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
            .outerjoin(ShareLink.gallery)
            .outerjoin(ShareLink.project)
            .where(*filters)
        )
        summary_row = (await self.db.execute(summary_stmt)).one()
        summary = {
            "views": int(summary_row[0] or 0),
            "zip_downloads": int(summary_row[1] or 0),
            "single_downloads": int(summary_row[2] or 0),
            "active_links": int(summary_row[3] or 0),
        }

        stmt = (
            select(ShareLink, Gallery.name, Project.name, latest_activity_expr)
            .outerjoin(ShareLink.gallery)
            .outerjoin(ShareLink.project)
            .outerjoin(session_activity_subquery, session_activity_subquery.c.sharelink_id == ShareLink.id)
            .where(*filters)
            .order_by(
                latest_activity_expr.desc(),
                ShareLink.updated_at.desc(),
                ShareLink.created_at.desc(),
                ShareLink.id.desc(),
            )
            .offset((page - 1) * size)
            .limit(size)
        )
        rows = [(row[0], row[1], row[2], row[3]) for row in (await self.db.execute(stmt)).all()]
        return await self._finish_read((rows, total, summary))

    async def get_owner_sharelink_daily_stats(
        self,
        owner_id: uuid.UUID,
        *,
        days: int,
        search: str | None = None,
        status: OwnerShareLinkStatus | None = None,
    ) -> list[tuple[date, int, int, int, int]]:
        filters = [self._owner_filter(owner_id)]
        now = datetime.now(UTC).replace(tzinfo=None)
        normalized_search = (search or "").strip()
        if normalized_search:
            escaped_search = self._escape_like_term(normalized_search)
            pattern = f"%{escaped_search}%"
            filters.append(
                or_(
                    ShareLink.label.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    Gallery.name.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    Project.name.ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                    cast(ShareLink.id, String).ilike(pattern, escape=self.LIKE_ESCAPE_CHAR),
                )
            )

        if status == "active":
            filters.extend(
                [
                    ShareLink.is_active.is_(True),
                    or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
                ]
            )
        elif status == "inactive":
            filters.append(ShareLink.is_active.is_(False))
        elif status == "expired":
            filters.extend([ShareLink.is_active.is_(True), ShareLink.expires_at.is_not(None), ShareLink.expires_at <= now])

        since_day = datetime.now(UTC).date() - timedelta(days=days - 1)
        stmt = (
            select(
                ShareLinkDailyStat.day,
                func.coalesce(func.sum(ShareLinkDailyStat.views_total), 0),
                func.coalesce(func.sum(ShareLinkDailyStat.views_unique), 0),
                func.coalesce(func.sum(ShareLinkDailyStat.zip_downloads), 0),
                func.coalesce(func.sum(ShareLinkDailyStat.single_downloads), 0),
            )
            .select_from(ShareLinkDailyStat)
            .join(ShareLink, ShareLinkDailyStat.sharelink_id == ShareLink.id)
            .outerjoin(ShareLink.gallery)
            .outerjoin(ShareLink.project)
            .where(ShareLinkDailyStat.day >= since_day, *filters)
            .group_by(ShareLinkDailyStat.day)
            .order_by(ShareLinkDailyStat.day.asc())
        )
        rows = [
            (
                row_day,
                int(views_total or 0),
                int(views_unique or 0),
                int(zip_downloads or 0),
                int(single_downloads or 0),
            )
            for row_day, views_total, views_unique, zip_downloads, single_downloads in (await self.db.execute(stmt)).all()
        ]
        return await self._finish_read(rows)

    async def get_owner_sharelink_cover_thumbnail_keys(
        self,
        sharelink_ids: list[uuid.UUID],
        owner_id: uuid.UUID,
    ) -> dict[uuid.UUID, str]:
        if not sharelink_ids:
            return await self._finish_read({})

        thumbnail_keys_by_sharelink: dict[uuid.UUID, str] = {}

        gallery_ranked = (
            select(
                ShareLink.id.label("sharelink_id"),
                Photo.thumbnail_object_key.label("thumbnail_object_key"),
                func.row_number()
                .over(
                    partition_by=ShareLink.id,
                    order_by=(
                        case((Photo.id == Gallery.cover_photo_id, 0), else_=1),
                        Photo.uploaded_at.desc(),
                        Photo.id.desc(),
                    ),
                )
                .label("photo_rank"),
            )
            .select_from(ShareLink)
            .join(Gallery, ShareLink.gallery_id == Gallery.id)
            .join(Photo, Photo.gallery_id == Gallery.id)
            .where(
                ShareLink.id.in_(sharelink_ids),
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
                Photo.thumbnail_object_key.is_not(None),
            )
            .subquery()
        )
        gallery_rows = await self.db.execute(
            select(gallery_ranked.c.sharelink_id, gallery_ranked.c.thumbnail_object_key).where(
                gallery_ranked.c.photo_rank == 1,
            )
        )
        thumbnail_keys_by_sharelink.update({sharelink_id: thumbnail_key for sharelink_id, thumbnail_key in gallery_rows.all() if thumbnail_key})

        project_ranked = (
            select(
                ShareLink.id.label("sharelink_id"),
                Photo.thumbnail_object_key.label("thumbnail_object_key"),
                func.row_number()
                .over(
                    partition_by=ShareLink.id,
                    order_by=(
                        Gallery.project_position.asc(),
                        Gallery.created_at.asc(),
                        Gallery.id.asc(),
                        Photo.uploaded_at.desc(),
                        Photo.id.desc(),
                    ),
                )
                .label("photo_rank"),
            )
            .select_from(ShareLink)
            .join(Project, ShareLink.project_id == Project.id)
            .join(Gallery, Gallery.project_id == Project.id)
            .join(Photo, Photo.gallery_id == Gallery.id)
            .where(
                ShareLink.id.in_(sharelink_ids),
                ShareLink.scope_type == ShareScopeType.PROJECT.value,
                Project.owner_id == owner_id,
                Project.is_deleted.is_(False),
                Gallery.is_deleted.is_(False),
                Gallery.project_visibility == ProjectVisibility.LISTED.value,
                Photo.thumbnail_object_key.is_not(None),
            )
            .subquery()
        )
        project_rows = await self.db.execute(
            select(project_ranked.c.sharelink_id, project_ranked.c.thumbnail_object_key).where(
                project_ranked.c.photo_rank == 1,
            )
        )
        thumbnail_keys_by_sharelink.update({sharelink_id: thumbnail_key for sharelink_id, thumbnail_key in project_rows.all() if thumbnail_key})

        return await self._finish_read(thumbnail_keys_by_sharelink)

    async def get_sharelinks_for_project_warnings(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
    ) -> list[ShareLink]:
        stmt = (
            select(ShareLink)
            .outerjoin(ShareLink.gallery)
            .outerjoin(ShareLink.project)
            .where(
                or_(
                    and_(
                        ShareLink.scope_type == ShareScopeType.PROJECT.value,
                        ShareLink.project_id == project_id,
                        Project.owner_id == owner_id,
                        Project.is_deleted.is_(False),
                    ),
                    and_(
                        ShareLink.scope_type == ShareScopeType.GALLERY.value,
                        Gallery.project_id == project_id,
                        Gallery.owner_id == owner_id,
                        Gallery.is_deleted.is_(False),
                    ),
                )
            )
            .order_by(ShareLink.updated_at.desc(), ShareLink.created_at.desc())
        )
        sharelinks = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(sharelinks)

    async def get_photo_count_by_gallery(self, gallery_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_photo_stats_by_gallery(self, gallery_id: uuid.UUID) -> GalleryPhotoStats:
        count, total_size = (await self.db.execute(gallery_photo_stats_stmt(gallery_id))).one()
        return await self._finish_read(GalleryPhotoStats(photo_count=int(count or 0), total_size_bytes=int(total_size or 0)))

    async def get_photo_total_size_by_gallery(self, gallery_id: uuid.UUID) -> int:
        stmt = gallery_photo_total_size_stmt(gallery_id)
        total_size = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(total_size)

    async def get_photos_by_gallery_id(
        self,
        gallery_id: uuid.UUID,
        limit: int | None = None,
        offset: int = 0,
        sort_by: GalleryPhotoSortBy = GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order: SortOrder = SortOrder.ASC,
    ) -> list[Photo]:
        stmt = (
            select(Photo)
            .join(Photo.gallery)
            .where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
            .order_by(*build_photo_order_clauses(sort_by, order, include_uploaded_at_tiebreaker=False))
            .offset(offset)
        )
        if limit is not None:
            stmt = stmt.limit(limit)

        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def get_photos_by_visible_project(
        self,
        project_id: uuid.UUID,
        sort_by: GalleryPhotoSortBy = GalleryPhotoSortBy.ORIGINAL_FILENAME,
        order: SortOrder = SortOrder.ASC,
    ) -> dict[uuid.UUID, list[Photo]]:
        stmt = (
            select(Gallery.id, Photo)
            .join(Photo.gallery)
            .where(
                Gallery.project_id == project_id,
                Gallery.is_deleted.is_(False),
                Gallery.project_visibility == ProjectVisibility.LISTED.value,
            )
            .order_by(
                Gallery.project_position.asc(),
                Gallery.created_at.asc(),
                Gallery.id.asc(),
                *build_photo_order_clauses(sort_by, order, include_uploaded_at_tiebreaker=False),
            )
        )

        photos_by_gallery: dict[uuid.UUID, list[Photo]] = {}
        for gallery_id_value, photo in (await self.db.execute(stmt)).all():
            photos_by_gallery.setdefault(gallery_id_value, []).append(photo)
        return await self._finish_read(photos_by_gallery)

    async def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        photo = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(photo)

    async def get_photos_by_ids_and_gallery(self, gallery_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> list[Photo]:
        if not photo_ids:
            return await self._finish_read([])

        stmt = (
            select(Photo)
            .join(Photo.gallery)
            .where(
                Photo.gallery_id == gallery_id,
                Photo.id.in_(photo_ids),
                Gallery.is_deleted.is_(False),
            )
        )
        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def get_photos_by_ids_and_project(
        self,
        project_id: uuid.UUID,
        photo_ids: list[uuid.UUID],
        *,
        listed_only: bool = True,
    ) -> list[Photo]:
        if not photo_ids:
            return await self._finish_read([])

        filters = [
            Photo.id.in_(photo_ids),
            Gallery.project_id == project_id,
            Gallery.is_deleted.is_(False),
        ]
        if listed_only:
            filters.append(Gallery.project_visibility == "listed")

        stmt = select(Photo).join(Photo.gallery).where(*filters)
        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

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
            is_unique = bool(getattr(inserted, "rowcount", 0))

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
