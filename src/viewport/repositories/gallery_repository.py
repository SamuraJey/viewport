import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select

from src.viewport.models.gallery import Gallery, Photo
from src.viewport.models.sharelink import ShareLink
from src.viewport.repositories.base_repository import BaseRepository


class GalleryRepository(BaseRepository):
    def create_gallery(self, owner_id: uuid.UUID, name: str) -> Gallery:
        gallery = Gallery(id=uuid.uuid4(), owner_id=owner_id, name=name)
        self.db.add(gallery)
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def get_galleries_by_owner(self, owner_id: uuid.UUID, page: int, size: int) -> tuple[list[Gallery], int | None]:
        # Get total count
        count_stmt = select(func.count()).select_from(Gallery).where(Gallery.owner_id == owner_id)
        total = self.db.execute(count_stmt).scalar()

        # Get galleries with pagination
        stmt = select(Gallery).where(Gallery.owner_id == owner_id).order_by(Gallery.created_at.desc()).offset((page - 1) * size).limit(size)
        galleries = self.db.execute(stmt).scalars().all()

        return list(galleries), total

    def get_gallery_by_id_and_owner(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == owner_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def update_gallery_name(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, name: str) -> Gallery | None:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None
        gallery.name = name
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def delete_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False
        self.db.delete(gallery)
        self.db.commit()
        return True

    def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).where(Photo.id == photo_id, Photo.gallery_id == gallery_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def set_cover_photo(self, gallery_id: uuid.UUID, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None
        photo = self.get_photo_by_id_and_gallery(photo_id, gallery_id)
        if not photo:
            return None
        gallery.cover_photo_id = photo_id
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def clear_cover_photo(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None
        gallery.cover_photo_id = None
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def get_photo_by_id_and_owner(self, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == owner_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_photos_by_gallery_id(self, gallery_id: uuid.UUID) -> list[Photo]:
        stmt = select(Photo).where(Photo.gallery_id == gallery_id)
        return list(self.db.execute(stmt).scalars().all())

    def create_photo(self, gallery_id: uuid.UUID, object_key: str, file_size: int) -> Photo:
        photo = Photo(gallery_id=gallery_id, object_key=object_key, file_size=file_size)
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def delete_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return False
        self.db.delete(photo)
        self.db.commit()
        return True

    def create_sharelink(self, gallery_id: uuid.UUID, expires_at: datetime | None) -> ShareLink:
        sharelink = ShareLink(gallery_id=gallery_id, expires_at=expires_at, created_at=datetime.now(UTC))
        self.db.add(sharelink)
        self.db.commit()
        self.db.refresh(sharelink)
        return sharelink

    def delete_sharelink(self, sharelink_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        # First verify gallery ownership
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        # Then find and delete the sharelink
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id, ShareLink.gallery_id == gallery_id)
        sharelink = self.db.execute(stmt).scalar_one_or_none()
        if not sharelink:
            return False

        self.db.delete(sharelink)
        self.db.commit()
        return True
