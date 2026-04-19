import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select

from viewport.gallery_constants import PUBLIC_GALLERY_SORT_BY_DEFAULT, PUBLIC_GALLERY_SORT_ORDER_DEFAULT
from viewport.models.gallery import Gallery, Photo, ProjectVisibility
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink, ShareScopeType
from viewport.repositories.base_repository import BaseRepository
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder

DEFAULT_PUBLIC_SORT_BY = GalleryPhotoSortBy(PUBLIC_GALLERY_SORT_BY_DEFAULT)
DEFAULT_PUBLIC_SORT_ORDER = SortOrder(PUBLIC_GALLERY_SORT_ORDER_DEFAULT)


class ProjectRepository(BaseRepository):
    LIKE_ESCAPE_CHAR = "\\"

    @classmethod
    def _escape_like_term(cls, value: str) -> str:
        return value.replace(cls.LIKE_ESCAPE_CHAR, cls.LIKE_ESCAPE_CHAR * 2).replace("%", f"{cls.LIKE_ESCAPE_CHAR}%").replace("_", f"{cls.LIKE_ESCAPE_CHAR}_")

    async def create_project(self, owner_id: uuid.UUID, name: str, shooting_date: date | None = None) -> Project:
        project = Project(
            owner_id=owner_id,
            name=name,
            shooting_date=shooting_date or datetime.now(UTC).date(),
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def create_project_with_initial_gallery(
        self,
        owner_id: uuid.UUID,
        name: str,
        shooting_date: date | None = None,
        *,
        initial_gallery_name: str | None = None,
        public_sort_by: GalleryPhotoSortBy = DEFAULT_PUBLIC_SORT_BY,
        public_sort_order: SortOrder = DEFAULT_PUBLIC_SORT_ORDER,
        project_visibility: ProjectVisibility = ProjectVisibility.LISTED,
    ) -> tuple[Project, Gallery]:
        resolved_shooting_date = shooting_date or datetime.now(UTC).date()
        project = Project(
            owner_id=owner_id,
            name=name,
            shooting_date=resolved_shooting_date,
        )
        gallery = Gallery(
            owner_id=owner_id,
            project=project,
            project_position=0,
            project_visibility=project_visibility.value,
            name=initial_gallery_name if initial_gallery_name is not None else name,
            shooting_date=resolved_shooting_date,
            public_sort_by=public_sort_by.value,
            public_sort_order=public_sort_order.value,
        )

        self.db.add(project)
        self.db.add(gallery)
        try:
            await self.db.flush()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        await self.db.refresh(project)
        await self.db.refresh(gallery)
        return project, gallery

    async def get_projects_by_owner(
        self,
        owner_id: uuid.UUID,
        page: int,
        size: int,
        search: str | None = None,
    ) -> tuple[list[Project], int]:
        filters = [Project.owner_id == owner_id, Project.is_deleted.is_(False)]
        if search:
            escaped = self._escape_like_term(search)
            filters.append(Project.name.ilike(f"%{escaped}%", escape=self.LIKE_ESCAPE_CHAR))

        total_stmt = select(func.count()).select_from(Project).where(*filters)
        total = int((await self.db.execute(total_stmt)).scalar() or 0)

        stmt = select(Project).where(*filters).order_by(Project.created_at.desc(), Project.id.desc()).offset((page - 1) * size).limit(size)
        projects = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read((projects, total))

    async def get_project_by_id_and_owner(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project | None:
        stmt = select(Project).where(Project.id == project_id, Project.owner_id == owner_id, Project.is_deleted.is_(False))
        project = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(project)

    async def update_project(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
        *,
        name: str | None = None,
        shooting_date: date | None = None,
    ) -> Project | None:
        project = await self.get_project_by_id_and_owner(project_id, owner_id)
        if not project:
            return None

        updated = False
        if name is not None:
            project.name = name
            updated = True
        if shooting_date is not None:
            project.shooting_date = shooting_date
            updated = True
        if updated:
            await self.db.commit()
            await self.db.refresh(project)
        return project

    async def delete_project(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[bool, str | None]:
        project = await self.get_project_by_id_and_owner(project_id, owner_id)
        if not project:
            return False, None

        folder_count = await self.get_project_folder_count(project_id, listed_only=False)
        if folder_count > 0:
            return False, "Project must be empty before deletion"

        await self.db.delete(project)
        await self.db.commit()
        return True, None

    async def get_project_folders_by_owner(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> list[Gallery]:
        stmt = (
            select(Gallery)
            .where(
                Gallery.project_id == project_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(Gallery.project_position.asc(), Gallery.created_at.asc(), Gallery.id.asc())
        )
        galleries = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(galleries)

    async def get_project_entry_gallery(
        self,
        project_id: uuid.UUID,
        *,
        owner_id: uuid.UUID | None = None,
        listed_only: bool = False,
    ) -> Gallery | None:
        filters = [
            Gallery.project_id == project_id,
            Gallery.is_deleted.is_(False),
        ]
        if owner_id is not None:
            filters.append(Gallery.owner_id == owner_id)
        if listed_only:
            filters.append(Gallery.project_visibility == ProjectVisibility.LISTED.value)

        stmt = select(Gallery).where(*filters).order_by(Gallery.project_position.asc(), Gallery.created_at.asc(), Gallery.id.asc()).limit(1)
        gallery = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(gallery)

    async def get_project_folder_count(self, project_id: uuid.UUID, *, listed_only: bool) -> int:
        filters = [Gallery.project_id == project_id, Gallery.is_deleted.is_(False)]
        if listed_only:
            filters.append(Gallery.project_visibility == ProjectVisibility.LISTED.value)
        stmt = select(func.count()).select_from(Gallery).where(*filters)
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_project_total_photo_count(self, project_id: uuid.UUID, *, listed_only: bool) -> int:
        filters = [Gallery.project_id == project_id, Gallery.is_deleted.is_(False)]
        if listed_only:
            filters.append(Gallery.project_visibility == ProjectVisibility.LISTED.value)
        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(*filters)
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_project_total_size(self, project_id: uuid.UUID, *, listed_only: bool) -> int:
        filters = [Gallery.project_id == project_id, Gallery.is_deleted.is_(False)]
        if listed_only:
            filters.append(Gallery.project_visibility == ProjectVisibility.LISTED.value)
        stmt = select(func.coalesce(func.sum(Photo.file_size), 0)).select_from(Photo).join(Photo.gallery).where(*filters)
        total_size = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(total_size)

    async def has_active_share_links(self, project_id: uuid.UUID) -> bool:
        now = datetime.now(UTC).replace(tzinfo=None)
        stmt = (
            select(func.count())
            .select_from(ShareLink)
            .where(
                ShareLink.project_id == project_id,
                ShareLink.scope_type == ShareScopeType.PROJECT.value,
                ShareLink.is_active.is_(True),
                or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
            )
        )
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count > 0)

    async def get_recent_project_thumbnail_keys(self, project_id: uuid.UUID, *, listed_only: bool, limit: int = 3) -> list[str]:
        filters = [Gallery.project_id == project_id, Gallery.is_deleted.is_(False), Photo.thumbnail_object_key.is_not(None)]
        if listed_only:
            filters.append(Gallery.project_visibility == ProjectVisibility.LISTED.value)
        stmt = select(Photo.thumbnail_object_key).join(Photo.gallery).where(*filters).order_by(Gallery.project_position.asc(), Photo.uploaded_at.desc(), Photo.id.desc()).limit(limit)
        keys = [key for key in (await self.db.execute(stmt)).scalars().all() if key]
        return await self._finish_read(keys)

    async def get_visible_project_folders(self, project_id: uuid.UUID, limit: int | None = None, offset: int = 0) -> list[Gallery]:
        stmt = (
            select(Gallery)
            .where(
                Gallery.project_id == project_id,
                Gallery.is_deleted.is_(False),
                Gallery.project_visibility == ProjectVisibility.LISTED.value,
            )
            .order_by(Gallery.project_position.asc(), Gallery.created_at.asc(), Gallery.id.asc())
            .offset(offset)
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        galleries = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(galleries)

    async def get_visible_project_folder_by_id(self, project_id: uuid.UUID, folder_id: uuid.UUID) -> Gallery | None:
        stmt = select(Gallery).where(
            Gallery.id == folder_id,
            Gallery.project_id == project_id,
            Gallery.is_deleted.is_(False),
            Gallery.project_visibility == ProjectVisibility.LISTED.value,
        )
        gallery = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(gallery)

    async def create_project_sharelink(
        self,
        project_id: uuid.UUID,
        expires_at: datetime | None,
        *,
        label: str | None = None,
        is_active: bool = True,
    ) -> ShareLink:
        sharelink = ShareLink(
            project_id=project_id,
            scope_type=ShareScopeType.PROJECT.value,
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

    async def get_sharelinks_by_project(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> list[ShareLink]:
        stmt = (
            select(ShareLink)
            .join(ShareLink.project)
            .where(
                ShareLink.project_id == project_id,
                ShareLink.scope_type == ShareScopeType.PROJECT.value,
                Project.owner_id == owner_id,
                Project.is_deleted.is_(False),
            )
            .order_by(ShareLink.created_at.desc())
        )
        sharelinks = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(sharelinks)

    async def update_project_sharelink(
        self,
        sharelink_id: uuid.UUID,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
        *,
        label: str | None = None,
        expires_at: datetime | None = None,
        is_active: bool | None = None,
        fields_set: set[str],
    ) -> ShareLink | None:
        project = await self.get_project_by_id_and_owner(project_id, owner_id)
        if not project:
            return None

        stmt = select(ShareLink).where(
            ShareLink.id == sharelink_id,
            ShareLink.project_id == project_id,
            ShareLink.scope_type == ShareScopeType.PROJECT.value,
        )
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

    async def delete_project_sharelink(self, sharelink_id: uuid.UUID, project_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        project = await self.get_project_by_id_and_owner(project_id, owner_id)
        if not project:
            return False
        stmt = select(ShareLink).where(
            ShareLink.id == sharelink_id,
            ShareLink.project_id == project_id,
            ShareLink.scope_type == ShareScopeType.PROJECT.value,
        )
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        if not sharelink:
            return False
        await self.db.delete(sharelink)
        await self.db.commit()
        return True
