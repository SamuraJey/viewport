import hashlib
import secrets
import uuid
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import and_, case, delete, desc, func, select
from sqlalchemy.orm import selectinload

from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_selection import SelectionSessionStatus, ShareLinkSelectionConfig, ShareLinkSelectionItem, ShareLinkSelectionSession
from viewport.repositories.base_repository import BaseRepository


class SelectionRepository(BaseRepository):
    @staticmethod
    def _hash_resume_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def generate_resume_token() -> tuple[str, str]:
        token = secrets.token_urlsafe(32)
        return token, SelectionRepository._hash_resume_token(token)

    async def get_public_sharelink(self, share_id: uuid.UUID) -> ShareLink | None:
        stmt = select(ShareLink).where(ShareLink.id == share_id).options(selectinload(ShareLink.gallery))
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    async def get_owner_sharelink(self, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> ShareLink | None:
        stmt = (
            select(ShareLink)
            .join(ShareLink.gallery)
            .where(
                ShareLink.id == sharelink_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .options(selectinload(ShareLink.gallery))
        )
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    async def get_sharelink_for_gallery_owner(self, gallery_id: uuid.UUID, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> ShareLink | None:
        stmt = (
            select(ShareLink)
            .join(ShareLink.gallery)
            .where(
                ShareLink.id == sharelink_id,
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .options(selectinload(ShareLink.gallery))
        )
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(sharelink)

    async def get_or_create_config(self, sharelink_id: uuid.UUID) -> ShareLinkSelectionConfig:
        stmt = select(ShareLinkSelectionConfig).where(ShareLinkSelectionConfig.sharelink_id == sharelink_id)
        config = (await self.db.execute(stmt)).scalar_one_or_none()
        if config:
            return await self._finish_read(config)

        config = ShareLinkSelectionConfig(sharelink_id=sharelink_id)
        self.db.add(config)
        await self.db.commit()
        await self.db.refresh(config)
        return config

    async def update_config(
        self,
        sharelink_id: uuid.UUID,
        *,
        fields_set: set[str],
        is_enabled: bool | None = None,
        list_title: str | None = None,
        limit_enabled: bool | None = None,
        limit_value: int | None = None,
        allow_photo_comments: bool | None = None,
        require_email: bool | None = None,
        require_phone: bool | None = None,
        require_client_note: bool | None = None,
    ) -> ShareLinkSelectionConfig:
        config = await self.get_or_create_config(sharelink_id)
        updated = False

        if "is_enabled" in fields_set and is_enabled is not None:
            config.is_enabled = is_enabled
            updated = True
        if "list_title" in fields_set and list_title is not None:
            config.list_title = list_title.strip() or "Selected photos"
            updated = True
        if "limit_enabled" in fields_set and limit_enabled is not None:
            config.limit_enabled = limit_enabled
            if not limit_enabled:
                config.limit_value = None
            updated = True
        if "limit_value" in fields_set:
            config.limit_value = limit_value
            updated = True
        if "allow_photo_comments" in fields_set and allow_photo_comments is not None:
            config.allow_photo_comments = allow_photo_comments
            updated = True
        if "require_email" in fields_set and require_email is not None:
            config.require_email = require_email
            updated = True
        if "require_phone" in fields_set and require_phone is not None:
            config.require_phone = require_phone
            updated = True
        if "require_client_note" in fields_set and require_client_note is not None:
            config.require_client_note = require_client_note
            updated = True

        if updated:
            config.updated_at = datetime.now(UTC)
            await self.db.commit()
            await self.db.refresh(config)

        return await self._finish_read(config)

    async def get_session_for_sharelink(self, sharelink_id: uuid.UUID) -> ShareLinkSelectionSession | None:
        stmt = select(ShareLinkSelectionSession).where(ShareLinkSelectionSession.sharelink_id == sharelink_id).options(selectinload(ShareLinkSelectionSession.items))
        session = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(session)

    async def get_session_by_resume_token(self, sharelink_id: uuid.UUID, resume_token: str) -> ShareLinkSelectionSession | None:
        token_hash = self._hash_resume_token(resume_token)
        stmt = (
            select(ShareLinkSelectionSession)
            .where(
                ShareLinkSelectionSession.sharelink_id == sharelink_id,
                ShareLinkSelectionSession.resume_token_hash == token_hash,
            )
            .options(selectinload(ShareLinkSelectionSession.items))
        )
        session = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(session)

    async def create_or_replace_session(
        self,
        sharelink_id: uuid.UUID,
        config_id: uuid.UUID,
        *,
        client_name: str,
        client_email: str | None,
        client_phone: str | None,
        client_note: str | None,
        resume_token_hash: str,
    ) -> ShareLinkSelectionSession:
        existing = await self.get_session_for_sharelink(sharelink_id)
        if existing:
            await self.db.execute(delete(ShareLinkSelectionItem).where(ShareLinkSelectionItem.session_id == existing.id))
            await self.db.delete(existing)
            await self.db.flush()

        session = ShareLinkSelectionSession(
            sharelink_id=sharelink_id,
            config_id=config_id,
            client_name=client_name,
            client_email=client_email,
            client_phone=client_phone,
            client_note=client_note,
            status=SelectionSessionStatus.IN_PROGRESS.value,
            submitted_at=None,
            last_activity_at=datetime.now(UTC),
            selected_count=0,
            resume_token_hash=resume_token_hash,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        await self.db.refresh(session, attribute_names=["items"])
        return session

    async def upsert_selection_item(self, session_id: uuid.UUID, photo_id: uuid.UUID, comment: str | None = None) -> ShareLinkSelectionItem:
        stmt = select(ShareLinkSelectionItem).where(ShareLinkSelectionItem.session_id == session_id, ShareLinkSelectionItem.photo_id == photo_id)
        item = (await self.db.execute(stmt)).scalar_one_or_none()
        now = datetime.now(UTC)
        if item:
            item.updated_at = now
            if comment is not None:
                item.comment = comment
            await self.db.commit()
            await self.db.refresh(item)
            return item

        item = ShareLinkSelectionItem(
            session_id=session_id,
            photo_id=photo_id,
            comment=comment,
            selected_at=now,
            updated_at=now,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete_selection_item(self, session_id: uuid.UUID, photo_id: uuid.UUID) -> bool:
        item = await self.get_selection_item(session_id, photo_id)
        if not item:
            return False
        await self.db.delete(item)
        await self.db.commit()
        return True

    async def get_selection_item(self, session_id: uuid.UUID, photo_id: uuid.UUID) -> ShareLinkSelectionItem | None:
        stmt = select(ShareLinkSelectionItem).where(
            ShareLinkSelectionItem.session_id == session_id,
            ShareLinkSelectionItem.photo_id == photo_id,
        )
        item = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(item)

    async def update_session_note(self, session: ShareLinkSelectionSession, client_note: str | None) -> ShareLinkSelectionSession:
        session.client_note = client_note
        session.last_activity_at = datetime.now(UTC)
        session.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(session)
        await self.db.refresh(session, attribute_names=["items"])
        return session

    async def touch_session(self, session: ShareLinkSelectionSession) -> ShareLinkSelectionSession:
        session.last_activity_at = datetime.now(UTC)
        session.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(session)
        await self.db.refresh(session, attribute_names=["items"])
        return session

    async def refresh_selected_count(self, session: ShareLinkSelectionSession) -> int:
        count_stmt = select(func.count()).select_from(ShareLinkSelectionItem).where(ShareLinkSelectionItem.session_id == session.id)
        selected_count = int((await self.db.execute(count_stmt)).scalar() or 0)
        session.selected_count = selected_count
        session.last_activity_at = datetime.now(UTC)
        session.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(session)
        return selected_count

    async def submit_session(self, session: ShareLinkSelectionSession) -> ShareLinkSelectionSession:
        now = datetime.now(UTC)
        session.status = SelectionSessionStatus.SUBMITTED.value
        session.submitted_at = now
        session.last_activity_at = now
        session.updated_at = now
        await self.db.commit()
        await self.db.refresh(session)
        await self.db.refresh(session, attribute_names=["items"])
        return session

    async def set_session_status(self, session: ShareLinkSelectionSession, status: SelectionSessionStatus) -> ShareLinkSelectionSession:
        now = datetime.now(UTC)
        session.status = status.value
        session.updated_at = now
        session.last_activity_at = now
        if status != SelectionSessionStatus.SUBMITTED:
            session.submitted_at = None
        await self.db.commit()
        await self.db.refresh(session)
        await self.db.refresh(session, attribute_names=["items"])
        return session

    async def get_owner_selection_row(self, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[ShareLink, ShareLinkSelectionSession | None, ShareLinkSelectionConfig | None] | None:
        stmt = (
            select(ShareLink, ShareLinkSelectionSession, ShareLinkSelectionConfig)
            .join(ShareLink.gallery)
            .outerjoin(ShareLinkSelectionSession, ShareLinkSelectionSession.sharelink_id == ShareLink.id)
            .outerjoin(ShareLinkSelectionConfig, ShareLinkSelectionConfig.sharelink_id == ShareLink.id)
            .where(
                ShareLink.id == sharelink_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
        )
        row = (await self.db.execute(stmt)).one_or_none()
        if not row:
            return await self._finish_read(None)
        sharelink, session, config = row
        return await self._finish_read((sharelink, session, config))

    async def get_gallery_selection_rows(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> list[tuple[ShareLink, ShareLinkSelectionSession | None]]:
        stmt = (
            select(ShareLink, ShareLinkSelectionSession)
            .join(ShareLink.gallery)
            .outerjoin(ShareLinkSelectionSession, ShareLinkSelectionSession.sharelink_id == ShareLink.id)
            .where(
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(desc(func.coalesce(ShareLinkSelectionSession.updated_at, ShareLink.updated_at)))
        )
        rows = [(sharelink, session) for sharelink, session in (await self.db.execute(stmt)).all()]
        return await self._finish_read(rows)

    async def close_all_for_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> int:
        now = datetime.now(UTC)
        stmt = (
            select(ShareLinkSelectionSession)
            .join(ShareLink, ShareLink.id == ShareLinkSelectionSession.sharelink_id)
            .join(ShareLink.gallery)
            .where(
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
                ShareLinkSelectionSession.status != SelectionSessionStatus.CLOSED.value,
            )
        )
        sessions = list((await self.db.execute(stmt)).scalars().all())
        for session in sessions:
            session.status = SelectionSessionStatus.CLOSED.value
            session.updated_at = now
            session.last_activity_at = now
        if sessions:
            await self.db.commit()
        return await self._finish_read(len(sessions))

    async def reopen_all_for_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> int:
        now = datetime.now(UTC)
        stmt = (
            select(ShareLinkSelectionSession)
            .join(ShareLink, ShareLink.id == ShareLinkSelectionSession.sharelink_id)
            .join(ShareLink.gallery)
            .where(
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
                ShareLinkSelectionSession.status == SelectionSessionStatus.CLOSED.value,
            )
        )
        sessions = list((await self.db.execute(stmt)).scalars().all())
        for session in sessions:
            session.status = SelectionSessionStatus.IN_PROGRESS.value
            session.updated_at = now
            session.last_activity_at = now
        if sessions:
            await self.db.commit()
        return await self._finish_read(len(sessions))

    async def count_selected_for_sharelink(self, sharelink_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(ShareLinkSelectionItem)
            .join(ShareLinkSelectionSession, ShareLinkSelectionSession.id == ShareLinkSelectionItem.session_id)
            .where(ShareLinkSelectionSession.sharelink_id == sharelink_id)
        )
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_selected_items_for_sharelink(self, sharelink_id: uuid.UUID) -> list[tuple[str, str | None]]:
        stmt = (
            select(Photo.display_name, ShareLinkSelectionItem.comment)
            .select_from(ShareLinkSelectionItem)
            .join(ShareLinkSelectionSession, ShareLinkSelectionSession.id == ShareLinkSelectionItem.session_id)
            .join(Photo, Photo.id == ShareLinkSelectionItem.photo_id)
            .where(ShareLinkSelectionSession.sharelink_id == sharelink_id)
            .order_by(func.lower(Photo.display_name).asc())
        )
        rows = [(display_name, comment) for display_name, comment in (await self.db.execute(stmt)).all()]
        return await self._finish_read(rows)

    async def get_gallery_selection_summary(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> list[tuple[uuid.UUID, str | None, str, int]]:
        status_case = case(
            (
                and_(ShareLinkSelectionSession.id.is_not(None), ShareLinkSelectionSession.status == SelectionSessionStatus.SUBMITTED.value),
                "submitted",
            ),
            (
                and_(ShareLinkSelectionSession.id.is_not(None), ShareLinkSelectionSession.status == SelectionSessionStatus.CLOSED.value),
                "closed",
            ),
            (
                ShareLinkSelectionSession.id.is_not(None),
                "in_progress",
            ),
            else_="not_started",
        )

        stmt = (
            select(
                ShareLink.id,
                ShareLink.label,
                status_case.label("selection_status"),
                func.coalesce(ShareLinkSelectionSession.selected_count, 0).label("selected_count"),
            )
            .join(ShareLink.gallery)
            .outerjoin(ShareLinkSelectionSession, ShareLinkSelectionSession.sharelink_id == ShareLink.id)
            .where(
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(func.lower(func.coalesce(ShareLink.label, "")).asc(), ShareLink.created_at.asc())
        )
        raw_rows = list((await self.db.execute(stmt)).all())
        rows: list[tuple[uuid.UUID, str | None, str, int]] = [
            (
                cast(uuid.UUID, sharelink_id),
                label,
                cast(str, selection_status),
                int(selected_count),
            )
            for sharelink_id, label, selection_status, selected_count in raw_rows
        ]
        return await self._finish_read(rows)

    async def validate_photo_belongs_to_share_gallery(self, sharelink_id: uuid.UUID, photo_id: uuid.UUID) -> bool:
        stmt = (
            select(func.count())
            .select_from(Photo)
            .join(ShareLink, ShareLink.gallery_id == Photo.gallery_id)
            .join(ShareLink.gallery)
            .where(
                ShareLink.id == sharelink_id,
                Photo.id == photo_id,
                Gallery.is_deleted.is_(False),
            )
        )
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count > 0)

    async def get_sharelink_label_and_gallery_name(self, sharelink_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[str | None, str] | None:
        stmt = (
            select(ShareLink.label, Gallery.name)
            .join(ShareLink.gallery)
            .where(
                ShareLink.id == sharelink_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
        )
        row = (await self.db.execute(stmt)).one_or_none()
        if not row:
            return await self._finish_read(None)
        label, gallery_name = row
        return await self._finish_read((label, gallery_name))

    async def gallery_exists_for_owner(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        stmt = (
            select(func.count())
            .select_from(Gallery)
            .where(
                Gallery.id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
        )
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count > 0)

    async def get_gallery_sharelinks_with_sessions(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> list[tuple[ShareLink, ShareLinkSelectionSession | None]]:
        stmt = (
            select(ShareLink, ShareLinkSelectionSession)
            .join(ShareLink.gallery)
            .outerjoin(ShareLinkSelectionSession, ShareLinkSelectionSession.sharelink_id == ShareLink.id)
            .where(
                ShareLink.gallery_id == gallery_id,
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(ShareLink.created_at.asc())
        )
        rows = [(sharelink, session) for sharelink, session in (await self.db.execute(stmt)).all()]
        return await self._finish_read(rows)
