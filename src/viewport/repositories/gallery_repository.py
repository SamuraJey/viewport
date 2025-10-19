import logging
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, insert, select

from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)


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
        from viewport.minio_utils import delete_folder

        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        # Delete the entire gallery folder from MinIO (including all photos and thumbnails)
        delete_folder(f"{gallery_id}/")

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
        # Sort by object_key (which contains the filename after the gallery prefix)
        stmt = select(Photo).where(Photo.gallery_id == gallery_id).order_by(Photo.object_key.asc())
        return list(self.db.execute(stmt).scalars().all())

    def create_photo(self, gallery_id: uuid.UUID, object_key: str, thumbnail_object_key: str, file_size: int, width: int | None = None, height: int | None = None) -> Photo:
        photo = Photo(gallery_id=gallery_id, object_key=object_key, thumbnail_object_key=thumbnail_object_key, file_size=file_size, width=width, height=height)
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def create_photos_batch(
        self,
        photos_data: list[dict],
    ) -> list[Photo]:
        """Batch create multiple photos efficiently

        Args:
            photos_data: List of dicts with keys: gallery_id, object_key, thumbnail_object_key,
                        file_size, width (optional), height (optional)

        Returns:
            List of created Photo objects
        """

        start_time = time.time()

        # Add timestamps to all records
        now = datetime.now(UTC)
        for data in photos_data:
            data["uploaded_at"] = now

        logger.info(f"Starting batch INSERT of {len(photos_data)} photos")
        insert_start = time.time()

        # Single INSERT with RETURNING - much faster than bulk_insert_mappings + SELECT
        stmt = insert(Photo).values(photos_data).returning(Photo)
        result = self.db.execute(stmt)
        photos = list(result.scalars().all())

        insert_duration = time.time() - insert_start
        logger.info(f"INSERT completed in {insert_duration:.2f}s")

        commit_start = time.time()
        self.db.commit()
        commit_duration = time.time() - commit_start

        total_duration = time.time() - start_time
        logger.info(f"Batch INSERT total: {total_duration:.2f}s (INSERT: {insert_duration:.2f}s, COMMIT: {commit_duration:.2f}s)")

        return photos

    def delete_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        from viewport.minio_utils import delete_object

        photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return False

        # Delete both original and thumbnail from MinIO
        delete_object(photo.object_key)  # We don't fail if MinIO deletion fails
        if photo.thumbnail_object_key != photo.object_key:  # Only delete if different
            delete_object(photo.thumbnail_object_key)

        # Delete from database
        self.db.delete(photo)
        self.db.commit()
        return True

    def rename_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, new_filename: str) -> Photo | None:
        """Rename a photo by updating its object_key with the new filename"""
        from viewport.cache_utils import clear_presigned_url_cache
        from viewport.minio_utils import rename_object

        photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return None

        # Extract the gallery_id from the object_key and replace filename
        # object_key format: "gallery_id/filename"
        if "/" in photo.object_key:
            gallery_prefix = photo.object_key.split("/", 1)[0]
            new_object_key = f"{gallery_prefix}/{new_filename}"
        else:
            # Fallback if object_key doesn't have the expected format
            new_object_key = f"{gallery_id}/{new_filename}"

        # Rename the file in MinIO first
        if not rename_object(photo.object_key, new_object_key):
            return None  # Return None if MinIO operation fails

        # Clear cached presigned URL for both old and new object keys
        clear_presigned_url_cache(photo.object_key)
        clear_presigned_url_cache(new_object_key)

        # Update the database only if MinIO operation succeeded
        photo.object_key = new_object_key
        self.db.commit()
        self.db.refresh(photo)
        return photo

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
