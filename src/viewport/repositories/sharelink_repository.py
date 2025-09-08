import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from src.viewport.models.gallery import Photo
from src.viewport.models.sharelink import ShareLink
from src.viewport.repositories.base_repository import BaseRepository


class ShareLinkRepository(BaseRepository):
    def get_sharelink_by_id(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_valid_sharelink(self, sharelink_id: uuid.UUID) -> ShareLink | None:
        sharelink = self.get_sharelink_by_id(sharelink_id)
        if not sharelink:
            return None
        if sharelink.expires_at and sharelink.expires_at.timestamp() < datetime.now(UTC).timestamp():
            return None
        return sharelink

    def get_photos_by_gallery_id(self, gallery_id: uuid.UUID) -> list[Photo]:
        stmt = select(Photo).where(Photo.gallery_id == gallery_id)
        return list(self.db.execute(stmt).scalars().all())

    def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == gallery_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def increment_views(self, sharelink_id: uuid.UUID) -> None:
        sharelink = self.get_sharelink_by_id(sharelink_id)
        if sharelink:
            sharelink.views += 1
            self.db.commit()

    def increment_zip_downloads(self, sharelink_id: uuid.UUID) -> None:
        sharelink = self.get_sharelink_by_id(sharelink_id)
        if sharelink:
            sharelink.zip_downloads += 1
            self.db.commit()

    def increment_single_downloads(self, sharelink_id: uuid.UUID) -> None:
        sharelink = self.get_sharelink_by_id(sharelink_id)
        if sharelink:
            sharelink.single_downloads += 1
            self.db.commit()
