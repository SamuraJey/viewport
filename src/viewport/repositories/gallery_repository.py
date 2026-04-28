import logging
import time
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import asc, desc, func, insert, or_, select, update
from sqlalchemy.exc import IntegrityError

from viewport.filename_utils import sanitize_filename, split_name_and_ext
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus, ProjectVisibility
from viewport.models.sharelink import ShareLink, ShareScopeType
from viewport.repositories.base_repository import BaseRepository
from viewport.repositories.gallery_stats import GalleryPhotoStats, gallery_photo_stats_stmt, gallery_photo_total_size_stmt
from viewport.repositories.photo_query_helpers import build_photo_order_clauses
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.gallery import GalleryListSortBy, GalleryPhotoSortBy, SortOrder
from viewport.schemas.gallery import ProjectVisibility as ProjectVisibilitySchema

logger = logging.getLogger(__name__)


class GalleryRepository(BaseRepository):
    LIKE_ESCAPE_CHAR = "\\"

    @classmethod
    def _escape_like_term(cls, value: str) -> str:
        """Escape SQL LIKE wildcards so search behaves as a literal substring match."""
        return value.replace(cls.LIKE_ESCAPE_CHAR, cls.LIKE_ESCAPE_CHAR * 2).replace("%", f"{cls.LIKE_ESCAPE_CHAR}%").replace("_", f"{cls.LIKE_ESCAPE_CHAR}_")

    @staticmethod
    def _build_photo_filters(gallery_id: uuid.UUID, search: str | None = None):
        filters = [Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)]
        if search:
            escaped_search = GalleryRepository._escape_like_term(search)
            filters.append(Photo.display_name.ilike(f"%{escaped_search}%", escape=GalleryRepository.LIKE_ESCAPE_CHAR))
        return filters

    @staticmethod
    def _build_gallery_order_clauses(
        sort_by: GalleryListSortBy,
        order: SortOrder,
        *,
        photo_count_column=None,
        total_size_column=None,
    ):
        order_fn = asc if order == SortOrder.ASC else desc

        if sort_by == GalleryListSortBy.NAME:
            return [order_fn(func.lower(Gallery.name)), order_fn(Gallery.created_at), order_fn(Gallery.id)]

        if sort_by == GalleryListSortBy.SHOOTING_DATE:
            return [order_fn(Gallery.shooting_date), order_fn(Gallery.created_at), order_fn(Gallery.id)]

        if sort_by == GalleryListSortBy.PHOTO_COUNT and photo_count_column is not None:
            return [order_fn(func.coalesce(photo_count_column, 0)), order_fn(Gallery.created_at), order_fn(Gallery.id)]

        if sort_by == GalleryListSortBy.TOTAL_SIZE_BYTES and total_size_column is not None:
            return [order_fn(func.coalesce(total_size_column, 0)), order_fn(Gallery.created_at), order_fn(Gallery.id)]

        return [order_fn(Gallery.created_at), order_fn(Gallery.id)]

    async def _make_unique_display_name(self, gallery_id: uuid.UUID, desired_name: str, exclude_photo_id: uuid.UUID | None = None) -> str:
        # Get all occupied names in case-insensitive way for this gallery
        stmt = select(Photo.display_name).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        if exclude_photo_id is not None:
            stmt = stmt.where(Photo.id != exclude_photo_id)

        # Store names in a lowercase set for fast case-insensitive lookup
        occupied_names_lower = {name.lower() for name in (await self.db.execute(stmt)).scalars().all() if name}

        candidate = desired_name
        stem, suffix = split_name_and_ext(candidate)

        counter = 1
        while candidate.lower() in occupied_names_lower:
            candidate = f"{stem} ({counter}){suffix}"
            counter += 1

        return candidate

    @staticmethod
    def _bound_project_index(target_index: int | None, length: int) -> int:
        if target_index is None:
            return length
        return max(0, min(target_index, length))

    @staticmethod
    def _reindex_project_galleries(galleries: list[Gallery]) -> None:
        for index, gallery in enumerate(galleries):
            gallery.project_position = index

    async def _get_project_galleries_for_update(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
    ) -> list[Gallery]:
        stmt = (
            select(Gallery)
            .where(
                Gallery.project_id == project_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(Gallery.project_position.asc(), Gallery.created_at.asc(), Gallery.id.asc())
            .with_for_update()
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def reorder_project_galleries(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
        ordered_gallery_ids: list[uuid.UUID],
    ) -> list[Gallery]:
        galleries = await self._get_project_galleries_for_update(project_id, owner_id)
        expected_ids = {gallery.id for gallery in galleries}
        requested_ids = set(ordered_gallery_ids)
        if len(ordered_gallery_ids) != len(requested_ids):
            raise ValueError("Gallery ids must be unique")
        if requested_ids != expected_ids:
            raise ValueError("Gallery ids must exactly match the project's galleries")

        galleries_by_id = {gallery.id: gallery for gallery in galleries}
        reordered_galleries = [galleries_by_id[gallery_id] for gallery_id in ordered_gallery_ids]
        self._reindex_project_galleries(reordered_galleries)
        await self.db.commit()
        for gallery in reordered_galleries:
            await self.db.refresh(gallery)
        return reordered_galleries

    async def create_gallery(
        self,
        owner_id: uuid.UUID,
        name: str,
        shooting_date: date | None = None,
        public_sort_by: GalleryPhotoSortBy = GalleryPhotoSortBy.ORIGINAL_FILENAME,
        public_sort_order: SortOrder = SortOrder.ASC,
        project_id: uuid.UUID | None = None,
        project_position: int | None = None,
        project_visibility: ProjectVisibility | ProjectVisibilitySchema = ProjectVisibility.LISTED,
    ) -> Gallery:
        gallery = Gallery(
            id=uuid.uuid4(),
            owner_id=owner_id,
            project_id=project_id,
            project_position=0,
            project_visibility=project_visibility.value,
            name=name,
            shooting_date=shooting_date or datetime.now(UTC).date(),
            public_sort_by=public_sort_by.value,
            public_sort_order=public_sort_order.value,
        )

        if project_id is not None:
            project_galleries = await self._get_project_galleries_for_update(project_id, owner_id)
            insert_index = self._bound_project_index(project_position, len(project_galleries))
            project_galleries.insert(insert_index, gallery)
            self._reindex_project_galleries(project_galleries)

        self.db.add(gallery)
        await self.db.commit()
        await self.db.refresh(gallery)
        return gallery

    async def get_galleries_by_owner(
        self,
        owner_id: uuid.UUID,
        page: int,
        size: int,
        search: str | None = None,
        sort_by: GalleryListSortBy = GalleryListSortBy.CREATED_AT,
        order: SortOrder = SortOrder.DESC,
        standalone_only: bool = False,
        project_id: uuid.UUID | None = None,
    ) -> tuple[list[Gallery], int | None]:
        filters = [Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False)]
        if standalone_only:
            filters.append(Gallery.project_id.is_(None))
        if project_id is not None:
            filters.append(Gallery.project_id == project_id)
        if search:
            escaped_search = self._escape_like_term(search)
            filters.append(Gallery.name.ilike(f"%{escaped_search}%", escape=self.LIKE_ESCAPE_CHAR))

        count_stmt = select(func.count()).select_from(Gallery).where(*filters)
        total = (await self.db.execute(count_stmt)).scalar()

        stmt = select(Gallery).where(*filters)
        if sort_by in (GalleryListSortBy.PHOTO_COUNT, GalleryListSortBy.TOTAL_SIZE_BYTES):
            photo_stats = (
                select(
                    Photo.gallery_id.label("gallery_id"),
                    func.count(Photo.id).label("photo_count"),
                    func.coalesce(func.sum(Photo.file_size), 0).label("total_size_bytes"),
                )
                .group_by(Photo.gallery_id)
                .subquery()
            )
            stmt = stmt.outerjoin(photo_stats, photo_stats.c.gallery_id == Gallery.id)
            order_by_clauses = self._build_gallery_order_clauses(
                sort_by,
                order,
                photo_count_column=photo_stats.c.photo_count,
                total_size_column=photo_stats.c.total_size_bytes,
            )
        else:
            order_by_clauses = self._build_gallery_order_clauses(sort_by, order)

        stmt = stmt.order_by(*order_by_clauses).offset((page - 1) * size).limit(size)
        galleries = (await self.db.execute(stmt)).scalars().all()

        return await self._finish_read((list(galleries), total))

    async def get_gallery_by_id_and_owner(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        gallery = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(gallery)

    async def get_sharelinks_by_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> list[ShareLink]:
        stmt = (
            select(ShareLink)
            .join(ShareLink.gallery)
            .where(
                ShareLink.gallery_id == gallery_id,
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(ShareLink.created_at.desc())
        )
        sharelinks = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(sharelinks)

    async def update_gallery(
        self,
        gallery_id: uuid.UUID,
        owner_id: uuid.UUID,
        name: str | None = None,
        shooting_date: date | None = None,
        project_id: uuid.UUID | None = None,
        project_position: int | None = None,
        project_visibility: ProjectVisibilitySchema | None = None,
        public_sort_by: GalleryPhotoSortBy | None = None,
        public_sort_order: SortOrder | None = None,
        fields_set: set[str] | None = None,
    ) -> Gallery | None:
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None

        updated = False
        if name is not None:
            gallery.name = name
            updated = True
        active_fields = fields_set or set()
        if shooting_date is not None:
            gallery.shooting_date = shooting_date
            updated = True
        if "project_id" in active_fields:
            source_project_id = gallery.project_id
            target_project_id = project_id

            if source_project_id == target_project_id and "project_position" not in active_fields:
                gallery.project_id = target_project_id
                updated = True
            else:
                if source_project_id and source_project_id != target_project_id:
                    source_galleries = await self._get_project_galleries_for_update(source_project_id, owner_id)
                    self._reindex_project_galleries([entry for entry in source_galleries if entry.id != gallery.id])

                gallery.project_id = target_project_id
                if target_project_id is None:
                    gallery.project_position = 0
                else:
                    target_galleries = await self._get_project_galleries_for_update(target_project_id, owner_id)
                    target_galleries = [entry for entry in target_galleries if entry.id != gallery.id]
                    insert_index = self._bound_project_index(
                        project_position if "project_position" in active_fields else None,
                        len(target_galleries),
                    )
                    target_galleries.insert(insert_index, gallery)
                    self._reindex_project_galleries(target_galleries)
                updated = True
        elif "project_position" in active_fields and project_position is not None and gallery.project_id is not None:
            target_galleries = await self._get_project_galleries_for_update(gallery.project_id, owner_id)
            target_galleries = [entry for entry in target_galleries if entry.id != gallery.id]
            insert_index = self._bound_project_index(project_position, len(target_galleries))
            target_galleries.insert(insert_index, gallery)
            self._reindex_project_galleries(target_galleries)
            updated = True
        if project_visibility is not None:
            gallery.project_visibility = project_visibility.value
            updated = True
        if public_sort_by is not None:
            gallery.public_sort_by = public_sort_by.value
            updated = True
        if public_sort_order is not None:
            gallery.public_sort_order = public_sort_order.value
            updated = True

        if updated:
            await self.db.commit()
            await self.db.refresh(gallery)
        return gallery

    async def delete_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        used_bytes = (
            await self.db.execute(
                select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                    Photo.gallery_id == gallery_id,
                    Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING]),
                )
            )
        ).scalar_one()
        reserved_bytes = (
            await self.db.execute(
                select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                    Photo.gallery_id == gallery_id,
                    Photo.status == PhotoUploadStatus.PENDING,
                )
            )
        ).scalar_one()

        user_repo = UserRepository(self.db)
        await user_repo.decrement_storage_used(gallery.owner_id, int(used_bytes), commit=False)
        await user_repo.release_reserved_storage(gallery.owner_id, int(reserved_bytes), commit=False)

        await self.db.delete(gallery)
        await self.db.commit()
        return True

    async def delete_gallery_async(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        """Hard delete gallery (S3 cleanup handled separately)."""
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        used_bytes = (
            await self.db.execute(
                select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                    Photo.gallery_id == gallery_id,
                    Photo.status.in_([PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING]),
                )
            )
        ).scalar_one()
        reserved_bytes = (
            await self.db.execute(
                select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                    Photo.gallery_id == gallery_id,
                    Photo.status == PhotoUploadStatus.PENDING,
                )
            )
        ).scalar_one()

        user_repo = UserRepository(self.db)
        await user_repo.decrement_storage_used(gallery.owner_id, int(used_bytes), commit=False)
        await user_repo.release_reserved_storage(gallery.owner_id, int(reserved_bytes), commit=False)

        await self.db.delete(gallery)
        await self.db.commit()
        return True

    async def soft_delete_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        """Soft delete gallery (mark as deleted)."""
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        gallery.is_deleted = True
        await self.db.commit()
        return True

    async def soft_delete_gallery_async(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        """Soft delete gallery (mark as deleted)."""
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False
        gallery.is_deleted = True
        await self.db.commit()
        return True

    async def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        photo = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(photo)

    async def set_cover_photo(self, gallery_id: uuid.UUID, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        # Perform single UPDATE with RETURNING to avoid loading objects into memory
        # Ensure the photo belongs to the gallery and the gallery belongs to owner
        stmt = (
            update(Gallery)
            .where(
                Gallery.id == gallery_id,
                Gallery.owner_id == owner_id,
                # only set if the photo exists and belongs to the gallery
                Gallery.is_deleted.is_(False),
            )
            .where(select(1).select_from(Photo).where(Photo.id == photo_id, Photo.gallery_id == gallery_id).exists())
            .values(cover_photo_id=photo_id)
            .returning(Gallery)
        )

        result = await self.db.execute(stmt)
        updated_gallery = result.scalars().first()
        if not updated_gallery:
            return None

        # Commit the change and return the refreshed gallery object
        await self.db.commit()
        # The returned `updated_gallery` is populated via RETURNING; refresh for any deferred attributes
        await self.db.refresh(updated_gallery)
        return updated_gallery

    async def clear_cover_photo(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None
        gallery.cover_photo_id = None
        await self.db.commit()
        await self.db.refresh(gallery)
        return gallery

    async def get_photo_by_id_and_owner(self, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        photo = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(photo)

    async def get_photos_by_gallery_id(self, gallery_id: uuid.UUID) -> list[Photo]:
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)).order_by(Photo.display_name.asc())
        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def get_photo_display_names_by_gallery(self, gallery_id: uuid.UUID) -> set[str]:
        stmt = select(Photo.display_name).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        names = (await self.db.execute(stmt)).scalars().all()
        return await self._finish_read({name for name in names if name})

    async def get_photo_count_by_gallery(self, gallery_id: uuid.UUID, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(*self._build_photo_filters(gallery_id, search))
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_photo_stats_by_gallery(self, gallery_id: uuid.UUID) -> GalleryPhotoStats:
        count, total_size = (await self.db.execute(gallery_photo_stats_stmt(gallery_id))).one()
        return await self._finish_read(GalleryPhotoStats(photo_count=int(count or 0), total_size_bytes=int(total_size or 0)))

    async def get_photo_total_size_by_gallery(self, gallery_id: uuid.UUID) -> int:
        stmt = gallery_photo_total_size_stmt(gallery_id)
        total_size = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(total_size)

    async def has_active_share_links(self, gallery_id: uuid.UUID) -> bool:
        """Check if gallery has any active share links."""
        now = datetime.now(UTC).replace(tzinfo=None)
        stmt = (
            select(func.count())
            .select_from(ShareLink)
            .where(
                ShareLink.gallery_id == gallery_id,
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                ShareLink.is_active.is_(True),
                (ShareLink.expires_at.is_(None) | (ShareLink.expires_at > now)),
            )
        )
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count > 0)

    async def get_recent_photo_thumbnail_keys_by_gallery(self, gallery_id: uuid.UUID, limit: int = 3) -> list[str]:
        stmt = (
            select(Photo.thumbnail_object_key)
            .join(Photo.gallery)
            .where(
                Photo.gallery_id == gallery_id,
                Gallery.is_deleted.is_(False),
                Photo.thumbnail_object_key.is_not(None),
            )
            .order_by(Photo.uploaded_at.desc(), Photo.id.desc())
            .limit(limit)
        )
        keys = [key for key in (await self.db.execute(stmt)).scalars().all() if key]
        return await self._finish_read(keys)

    async def get_gallery_list_enrichment(
        self,
        gallery_ids: list[uuid.UUID],
        cover_photo_ids: list[uuid.UUID],
        recent_limit: int = 3,
    ) -> tuple[
        dict[uuid.UUID, int],
        dict[uuid.UUID, int],
        set[uuid.UUID],
        dict[uuid.UUID, str],
        dict[uuid.UUID, list[str]],
    ]:
        """Return batched enrichment data used by gallery list responses."""
        if not gallery_ids:
            return await self._finish_read(({}, {}, set(), {}, {}))

        photo_stats_stmt = (
            select(
                Photo.gallery_id,
                func.count(Photo.id),
                func.coalesce(func.sum(Photo.file_size), 0),
            )
            .join(Photo.gallery)
            .where(
                Photo.gallery_id.in_(gallery_ids),
                Gallery.is_deleted.is_(False),
            )
            .group_by(Photo.gallery_id)
        )
        photo_stats_rows = (await self.db.execute(photo_stats_stmt)).all()
        photo_count_by_gallery: dict[uuid.UUID, int] = {}
        total_size_by_gallery: dict[uuid.UUID, int] = {}
        for gallery_id, count, total_size in photo_stats_rows:
            photo_count_by_gallery[gallery_id] = int(count or 0)
            total_size_by_gallery[gallery_id] = int(total_size or 0)

        now = datetime.now(UTC).replace(tzinfo=None)
        active_share_stmt = (
            select(ShareLink.gallery_id)
            .where(
                ShareLink.gallery_id.in_(gallery_ids),
                ShareLink.scope_type == ShareScopeType.GALLERY.value,
                ShareLink.is_active.is_(True),
                or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
            )
            .group_by(ShareLink.gallery_id)
        )
        active_share_gallery_ids = {gallery_id for gallery_id in (await self.db.execute(active_share_stmt)).scalars().all() if gallery_id is not None}

        cover_thumbnail_by_photo_id: dict[uuid.UUID, str] = {}
        if cover_photo_ids:
            cover_stmt = select(Photo.id, Photo.thumbnail_object_key).where(Photo.id.in_(cover_photo_ids), Photo.thumbnail_object_key.is_not(None))
            cover_thumbnail_by_photo_id = {photo_id: thumbnail_key for photo_id, thumbnail_key in (await self.db.execute(cover_stmt)).all() if thumbnail_key}

        ranked_thumbnails = (
            select(
                Photo.gallery_id.label("gallery_id"),
                Photo.thumbnail_object_key.label("thumbnail_object_key"),
                func.row_number()
                .over(
                    partition_by=Photo.gallery_id,
                    order_by=(Photo.uploaded_at.desc(), Photo.id.desc()),
                )
                .label("rank"),
            )
            .join(Photo.gallery)
            .where(
                Photo.gallery_id.in_(gallery_ids),
                Gallery.is_deleted.is_(False),
                Photo.thumbnail_object_key.is_not(None),
            )
            .subquery()
        )
        recent_stmt = (
            select(ranked_thumbnails.c.gallery_id, ranked_thumbnails.c.thumbnail_object_key)
            .where(ranked_thumbnails.c.rank <= recent_limit)
            .order_by(ranked_thumbnails.c.gallery_id, ranked_thumbnails.c.rank)
        )
        recent_thumbnail_keys_by_gallery: dict[uuid.UUID, list[str]] = {}
        for gallery_id, thumbnail_key in (await self.db.execute(recent_stmt)).all():
            if not thumbnail_key:
                continue
            recent_thumbnail_keys_by_gallery.setdefault(gallery_id, []).append(thumbnail_key)

        return await self._finish_read(
            (
                photo_count_by_gallery,
                total_size_by_gallery,
                active_share_gallery_ids,
                cover_thumbnail_by_photo_id,
                recent_thumbnail_keys_by_gallery,
            )
        )

    async def get_photos_by_gallery_paginated(
        self,
        gallery_id: uuid.UUID,
        limit: int | None,
        offset: int,
        search: str | None = None,
        sort_by: GalleryPhotoSortBy = GalleryPhotoSortBy.UPLOADED_AT,
        order: SortOrder = SortOrder.DESC,
    ) -> list[Photo]:
        stmt = select(Photo).join(Photo.gallery).where(*self._build_photo_filters(gallery_id, search)).order_by(*build_photo_order_clauses(sort_by, order)).offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def get_photos_by_ids_and_gallery(self, gallery_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> list[Photo]:
        if not photo_ids:
            return []
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Photo.id.in_(photo_ids), Gallery.is_deleted.is_(False))
        photos = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(photos)

    async def set_photo_status(self, photo: Photo, status: PhotoUploadStatus) -> Photo:
        photo.status = status
        await self.db.commit()
        await self.db.refresh(photo)
        return photo

    async def set_photos_statuses(self, photo_map: dict[uuid.UUID, Photo], status_updates: dict[uuid.UUID, PhotoUploadStatus], commit: bool = True) -> None:
        if not status_updates:
            return

        # Group by status to do bulk updates
        status_groups: dict[PhotoUploadStatus, list[uuid.UUID]] = {}
        for photo_id, status in status_updates.items():
            status_groups.setdefault(status, []).append(photo_id)

        for status, photo_ids in status_groups.items():
            await self.db.execute(update(Photo).where(Photo.id.in_(photo_ids)).values(status=status))

        # Also update the objects in memory so they reflect the new state
        for photo_id, status in status_updates.items():
            photo = photo_map.get(photo_id)
            if photo:
                photo.status = status

        if commit:
            await self.db.commit()

    async def create_photo(
        self,
        gallery_id: uuid.UUID,
        object_key: str,
        thumbnail_object_key: str,
        file_size: int,
        display_name: str | None = None,
        width: int | None = None,
        height: int | None = None,
    ) -> Photo:
        resolved_display_name = display_name or (object_key.split("/", 1)[1] if "/" in object_key else object_key)
        photo = Photo(
            gallery_id=gallery_id,
            object_key=object_key,
            thumbnail_object_key=thumbnail_object_key,
            display_name=resolved_display_name,
            file_size=file_size,
            width=width,
            height=height,
        )
        self.db.add(photo)
        await self.db.commit()
        await self.db.refresh(photo)
        return photo

    async def create_photos_batch(
        self,
        photos_data: list[dict],
    ) -> list[Photo]:
        """Batch create multiple photos efficiently

        Args:
            photos_data: List of dicts with keys: gallery_id, object_key, display_name, thumbnail_object_key,
                        file_size, width (optional), height (optional)

        Returns:
            List of created Photo objects
        """
        start_time = time.time()

        # Add timestamps to all records
        now = datetime.now(UTC)
        for data in photos_data:
            data["uploaded_at"] = now
            if not data.get("display_name"):
                object_key = str(data.get("object_key", ""))
                data["display_name"] = object_key.split("/", 1)[1] if "/" in object_key else object_key

        logger.info("Starting batch INSERT of %s photos", len(photos_data))
        insert_start = time.time()

        max_retries = 3
        for attempt in range(max_retries):
            # Try to perform the batch insert
            try:
                async with self.db.begin_nested():
                    # Single INSERT with RETURNING
                    stmt = insert(Photo).values(photos_data).returning(Photo)
                    result = await self.db.execute(stmt)
                    photos = list(result.scalars().all())

                insert_duration = time.time() - insert_start
                logger.info("INSERT completed in %.2fs (attempt %s)", insert_duration, attempt + 1)

                commit_start = time.time()
                await self.db.commit()
                commit_duration = time.time() - commit_start

                total_duration = time.time() - start_time
                logger.info("Batch INSERT total: %.2fs (INSERT: %.2fs, COMMIT: %.2fs)", total_duration, insert_duration, commit_duration)

                return photos
            except IntegrityError:
                if attempt == max_retries - 1:
                    logger.error("Batch INSERT failed after %s attempts due to integrity error", max_retries)
                    raise

                logger.warning("Integrity error during batch insert, retrying with unique names (attempt %s)", attempt + 1)
                # Re-calculate unique display names based on current DB state and
                # names already assigned within this batch retry (case-insensitive).
                occupied_names_by_gallery: dict[uuid.UUID, set[str]] = {}

                for data in photos_data:
                    gallery_id = data["gallery_id"]
                    if gallery_id in occupied_names_by_gallery:
                        continue

                    display_name_stmt = select(Photo.display_name).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
                    existing_names = (await self.db.execute(display_name_stmt)).scalars().all()
                    occupied_names_by_gallery[gallery_id] = {name.lower() for name in existing_names if name}

                for data in photos_data:
                    gallery_id = data["gallery_id"]
                    desired_name = data["display_name"]

                    occupied_names_lower = occupied_names_by_gallery[gallery_id]
                    candidate = desired_name
                    stem, suffix = split_name_and_ext(candidate)

                    counter = 1
                    while candidate.lower() in occupied_names_lower:
                        candidate = f"{stem} ({counter}){suffix}"
                        counter += 1

                    data["display_name"] = candidate
                    occupied_names_lower.add(candidate.lower())

        return []  # Should not reach here due to raise

    async def delete_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        photo = await self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return False

        user_repo = UserRepository(self.db)
        if photo.status in (PhotoUploadStatus.SUCCESSFUL, PhotoUploadStatus.THUMBNAIL_CREATING):
            await user_repo.decrement_storage_used(owner_id, photo.file_size, commit=False)
        elif photo.status == PhotoUploadStatus.PENDING:
            await user_repo.release_reserved_storage(owner_id, photo.file_size, commit=False)

        # Note: S3 deletion is done asynchronously in a background task
        # This method only deletes from database
        await self.db.delete(photo)
        await self.db.commit()
        return True

    async def rename_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, new_filename: str) -> Photo | None:  # type: ignore
        """Rename a photo by updating its display name only."""

        photo = await self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return None

        sanitized_filename = sanitize_filename(new_filename)
        photo.display_name = await self._make_unique_display_name(gallery_id, sanitized_filename, exclude_photo_id=photo.id)
        await self.db.commit()
        await self.db.refresh(photo)
        return photo

    async def rename_photo_async(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, new_filename: str) -> Photo | None:  # type: ignore
        """Rename a photo by updating its display name only.

        NOTE: DB calls are direct (no run_in_threadpool) to avoid session lifecycle race conditions.
        Short DB operations can safely block in async context.
        """
        photo = await self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return None

        sanitized_filename = sanitize_filename(new_filename)
        photo.display_name = await self._make_unique_display_name(gallery_id, sanitized_filename, exclude_photo_id=photo.id)
        await self.db.commit()
        await self.db.refresh(photo)
        return photo

    async def create_sharelink(
        self,
        gallery_id: uuid.UUID,
        expires_at: datetime | None,
        label: str | None = None,
        is_active: bool = True,
    ) -> ShareLink:
        sharelink = ShareLink(
            gallery_id=gallery_id,
            scope_type=ShareScopeType.GALLERY.value,
            label=label,
            is_active=is_active,
            expires_at=expires_at,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.db.add(sharelink)
        await self.db.commit()
        await self.db.refresh(sharelink)
        return sharelink

    async def update_sharelink(
        self,
        sharelink_id: uuid.UUID,
        gallery_id: uuid.UUID,
        owner_id: uuid.UUID,
        *,
        label: str | None = None,
        expires_at: datetime | None = None,
        is_active: bool | None = None,
        fields_set: set[str],
    ) -> ShareLink | None:
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None

        stmt = select(ShareLink).where(ShareLink.id == sharelink_id, ShareLink.gallery_id == gallery_id, ShareLink.scope_type == ShareScopeType.GALLERY.value)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        if not sharelink:
            return None

        updated = False
        if "label" in fields_set:
            sharelink.label = label
            updated = True
        if "expires_at" in fields_set:
            sharelink.expires_at = expires_at
            updated = True
        if "is_active" in fields_set:
            if is_active is None:
                raise ValueError("is_active cannot be null")
            sharelink.is_active = is_active
            updated = True

        if updated:
            sharelink.updated_at = datetime.now(UTC)
            await self.db.commit()
            await self.db.refresh(sharelink)

        return sharelink

    async def delete_sharelink(self, sharelink_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        # First verify gallery ownership
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        # Then find and delete the sharelink
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id, ShareLink.gallery_id == gallery_id, ShareLink.scope_type == ShareScopeType.GALLERY.value)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        if not sharelink:
            return False

        await self.db.delete(sharelink)
        await self.db.commit()
        return True
