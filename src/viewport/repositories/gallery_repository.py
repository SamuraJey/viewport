import logging
import time
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, insert, select, update
from sqlalchemy.orm import selectinload

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.repositories.base_repository import BaseRepository
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client

logger = logging.getLogger(__name__)


class GalleryRepository(BaseRepository):
    def create_gallery(self, owner_id: uuid.UUID, name: str, shooting_date: date | None = None) -> Gallery:
        gallery = Gallery(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name=name,
            shooting_date=shooting_date or datetime.now(UTC).date(),
        )
        self.db.add(gallery)
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def get_galleries_by_owner(self, owner_id: uuid.UUID, page: int, size: int) -> tuple[list[Gallery], int | None]:
        # Get total count
        count_stmt = select(func.count()).select_from(Gallery).where(Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        total = self.db.execute(count_stmt).scalar()

        # Get galleries with pagination
        stmt = select(Gallery).where(Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False)).order_by(Gallery.created_at.desc()).offset((page - 1) * size).limit(size)
        galleries = self.db.execute(stmt).scalars().all()

        return list(galleries), total

    def get_gallery_by_id_and_owner(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def get_gallery_by_id_and_owner_with_sharelinks(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        """Get gallery with eagerly loaded share_links to avoid lazy loading after commit."""
        stmt = select(Gallery).where(Gallery.id == gallery_id, Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False)).options(selectinload(Gallery.share_links))
        return self.db.execute(stmt).scalar_one_or_none()

    def update_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, name: str | None = None, shooting_date: date | None = None) -> Gallery | None:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None

        updated = False
        if name is not None:
            gallery.name = name
            updated = True
        if shooting_date is not None:
            gallery.shooting_date = shooting_date
            updated = True

        if updated:
            self.db.commit()
            self.db.refresh(gallery)
        return gallery

    def delete_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        used_bytes = self.db.execute(
            select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                Photo.gallery_id == gallery_id,
                Photo.status == PhotoUploadStatus.SUCCESSFUL,
            )
        ).scalar_one()
        reserved_bytes = self.db.execute(
            select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                Photo.gallery_id == gallery_id,
                Photo.status == PhotoUploadStatus.PENDING,
            )
        ).scalar_one()

        user_repo = UserRepository(self.db)
        user_repo.decrement_storage_used(gallery.owner_id, int(used_bytes), commit=False)
        user_repo.release_reserved_storage(gallery.owner_id, int(reserved_bytes), commit=False)

        self.db.delete(gallery)
        self.db.commit()
        return True

    async def delete_gallery_async(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        """Hard delete gallery (S3 cleanup handled separately)."""
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        used_bytes = self.db.execute(
            select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                Photo.gallery_id == gallery_id,
                Photo.status == PhotoUploadStatus.SUCCESSFUL,
            )
        ).scalar_one()
        reserved_bytes = self.db.execute(
            select(func.coalesce(func.sum(Photo.file_size), 0)).where(
                Photo.gallery_id == gallery_id,
                Photo.status == PhotoUploadStatus.PENDING,
            )
        ).scalar_one()

        user_repo = UserRepository(self.db)
        user_repo.decrement_storage_used(gallery.owner_id, int(used_bytes), commit=False)
        user_repo.release_reserved_storage(gallery.owner_id, int(reserved_bytes), commit=False)

        self.db.delete(gallery)
        self.db.commit()
        return True

    def soft_delete_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        """Soft delete gallery (mark as deleted)."""
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        gallery.is_deleted = True
        self.db.commit()
        return True

    async def soft_delete_gallery_async(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        """Soft delete gallery (mark as deleted)."""
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        gallery.is_deleted = True
        self.db.commit()
        return True

    def get_photo_by_id_and_gallery(self, photo_id: uuid.UUID, gallery_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def set_cover_photo(self, gallery_id: uuid.UUID, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
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

        result = self.db.execute(stmt)
        updated_gallery = result.scalars().first()
        if not updated_gallery:
            return None

        # Commit the change and return the refreshed gallery object
        self.db.commit()
        # The returned `updated_gallery` is populated via RETURNING; refresh for any deferred attributes
        self.db.refresh(updated_gallery)
        return updated_gallery

    def clear_cover_photo(self, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> Gallery | None:
        gallery = self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return None
        gallery.cover_photo_id = None
        self.db.commit()
        self.db.refresh(gallery)
        return gallery

    def get_photo_by_id_and_owner(self, photo_id: uuid.UUID, owner_id: uuid.UUID) -> Photo | None:
        stmt = select(Photo).join(Photo.gallery).where(Photo.id == photo_id, Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def get_photos_by_gallery_id(self, gallery_id: uuid.UUID) -> list[Photo]:
        # Sort by object_key (which contains the filename after the gallery prefix)
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)).order_by(Photo.object_key.asc())
        return list(self.db.execute(stmt).scalars().all())

    def get_photo_count_by_gallery(self, gallery_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        return int(self.db.execute(stmt).scalar() or 0)

    def get_photos_by_gallery_paginated(self, gallery_id: uuid.UUID, limit: int, offset: int) -> list[Photo]:
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)).order_by(Photo.object_key.asc()).offset(offset).limit(limit)
        return list(self.db.execute(stmt).scalars().all())

    def get_photos_by_ids_and_gallery(self, gallery_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> list[Photo]:
        if not photo_ids:
            return []
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Photo.id.in_(photo_ids), Gallery.is_deleted.is_(False))
        return list(self.db.execute(stmt).scalars().all())

    def set_photo_status(self, photo: Photo, status: int) -> Photo:
        photo.status = status
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def set_photos_statuses(self, photo_map: dict[uuid.UUID, Photo], status_updates: dict[uuid.UUID, int], commit: bool = True) -> None:
        if not status_updates:
            return
        for photo_id, status in status_updates.items():
            photo = photo_map.get(photo_id)
            if not photo:
                continue
            photo.status = status
        if commit:
            self.db.commit()

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

        logger.info("Starting batch INSERT of %s photos", len(photos_data))
        insert_start = time.time()

        # Single INSERT with RETURNING - much faster than bulk_insert_mappings + SELECT
        stmt = insert(Photo).values(photos_data).returning(Photo)
        result = self.db.execute(stmt)
        photos = list(result.scalars().all())

        insert_duration = time.time() - insert_start
        logger.info("INSERT completed in %.2fs", insert_duration)

        commit_start = time.time()
        self.db.commit()
        commit_duration = time.time() - commit_start

        total_duration = time.time() - start_time
        logger.info("Batch INSERT total: %.2fs (INSERT: %.2fs, COMMIT: %.2fs)", total_duration, insert_duration, commit_duration)

        return photos

    def delete_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return False

        user_repo = UserRepository(self.db)
        if photo.status == PhotoUploadStatus.SUCCESSFUL:
            user_repo.decrement_storage_used(owner_id, photo.file_size, commit=False)
        elif photo.status == PhotoUploadStatus.PENDING:
            user_repo.release_reserved_storage(owner_id, photo.file_size, commit=False)

        # Note: S3 deletion is done asynchronously in a background task
        # This method only deletes from database
        self.db.delete(photo)
        self.db.commit()
        return True

    async def delete_photo_async(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, s3_client: "AsyncS3Client") -> bool:  # type: ignore
        """Delete photo with S3 cleanup"""
        photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
        if not photo or photo.gallery_id != gallery_id:
            return False

        user_repo = UserRepository(self.db)
        if photo.status == PhotoUploadStatus.SUCCESSFUL:
            user_repo.decrement_storage_used(owner_id, photo.file_size, commit=False)
        elif photo.status == PhotoUploadStatus.PENDING:
            user_repo.release_reserved_storage(owner_id, photo.file_size, commit=False)

        # Delete both original and thumbnail from S3
        try:
            await s3_client.delete_file(photo.object_key)
        except Exception as e:
            logger.warning("Failed to delete original photo %s: %s", photo.object_key, e)

        if photo.thumbnail_object_key != photo.object_key:  # Only delete if different
            try:
                await s3_client.delete_file(photo.thumbnail_object_key)
            except Exception as e:
                logger.warning("Failed to delete thumbnail %s: %s", photo.thumbnail_object_key, e)

        # Delete from database
        self.db.delete(photo)
        self.db.commit()
        return True

    def rename_photo(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, new_filename: str, s3_client: "AsyncS3Client") -> Photo | None:  # type: ignore
        """Rename a photo by updating its object_key with the new filename

        Note: This is synchronous and doesn't perform S3 rename. Use rename_photo_async for full functionality.
        """
        from viewport.cache_utils import clear_presigned_url_cache

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

        # Clear cached presigned URL for old object key
        clear_presigned_url_cache(photo.object_key)

        # Update the database
        photo.object_key = new_object_key
        self.db.commit()
        self.db.refresh(photo)
        return photo

    async def rename_photo_async(self, photo_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID, new_filename: str, s3_client: "AsyncS3Client") -> Photo | None:  # type: ignore
        """Rename a photo with S3 rename operation"""
        from viewport.cache_utils import clear_presigned_url_cache

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

        # Rename the file in S3 first
        try:
            await s3_client.rename_file(photo.object_key, new_object_key)
        except Exception as e:
            logger.error("Failed to rename object in S3: %s", e)
            return None

        # Clear cached presigned URLs for both old and new object keys
        clear_presigned_url_cache(photo.object_key)
        clear_presigned_url_cache(new_object_key)

        # Update the database only if S3 operation succeeded
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
