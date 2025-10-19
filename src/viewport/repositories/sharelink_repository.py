import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from viewport.models.gallery import Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.base_repository import BaseRepository


class ShareLinkRepository(BaseRepository):  # pragma: no cover # TODO tests
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
        # Ensure consistent ordering by filename/object_key for public listings
        stmt = select(Photo).where(Photo.gallery_id == gallery_id).order_by(Photo.object_key.asc())
        return list(self.db.execute(stmt).scalars().all())

    def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == gallery_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def increment_views(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(views=ShareLink.views + 1)
        self.db.execute(stmt)
        self.db.commit()

    def increment_zip_downloads(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(zip_downloads=ShareLink.zip_downloads + 1)
        self.db.execute(stmt)
        self.db.commit()

    def increment_single_downloads(self, sharelink_id: uuid.UUID) -> None:
        stmt = update(ShareLink).where(ShareLink.id == sharelink_id).values(single_downloads=ShareLink.single_downloads + 1)
        self.db.execute(stmt)
        self.db.commit()
