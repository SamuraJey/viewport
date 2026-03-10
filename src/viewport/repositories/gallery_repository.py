import logging
import time
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError

from viewport.filename_utils import sanitize_filename
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.repositories.base_repository import BaseRepository
from viewport.repositories.user_repository import UserRepository
from viewport.s3_service import AsyncS3Client

logger = logging.getLogger(__name__)


class GalleryRepository(BaseRepository):
    @staticmethod
    def _split_name_and_ext(filename: str) -> tuple[str, str]:
        path = Path(filename)
        suffix = path.suffix if path.suffix else ""
        stem = path.stem if path.stem else "file"
        return stem, suffix

    async def _make_unique_display_name(self, gallery_id: uuid.UUID, desired_name: str, exclude_photo_id: uuid.UUID | None = None) -> str:
        # Get all occupied names in case-insensitive way for this gallery
        stmt = select(Photo.display_name).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        if exclude_photo_id is not None:
            stmt = stmt.where(Photo.id != exclude_photo_id)

        # Store names in a lowercase set for fast case-insensitive lookup
        occupied_names_lower = {name.lower() for name in (await self.db.execute(stmt)).scalars().all() if name}

        candidate = desired_name
        stem, suffix = self._split_name_and_ext(candidate)

        counter = 1
        while candidate.lower() in occupied_names_lower:
            candidate = f"{stem} ({counter}){suffix}"
            counter += 1

        return candidate

    async def create_gallery(self, owner_id: uuid.UUID, name: str, shooting_date: date | None = None) -> Gallery:
        gallery = Gallery(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name=name,
            shooting_date=shooting_date or datetime.now(UTC).date(),
        )
        self.db.add(gallery)
        await self.db.commit()
        await self.db.refresh(gallery)
        return gallery

    async def get_galleries_by_owner(self, owner_id: uuid.UUID, page: int, size: int) -> tuple[list[Gallery], int | None]:
        # Get total count
        count_stmt = select(func.count()).select_from(Gallery).where(Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False))
        total = (await self.db.execute(count_stmt)).scalar()

        # Get galleries with pagination
        stmt = select(Gallery).where(Gallery.owner_id == owner_id, Gallery.is_deleted.is_(False)).order_by(Gallery.created_at.desc()).offset((page - 1) * size).limit(size)
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
                Gallery.owner_id == owner_id,
                Gallery.is_deleted.is_(False),
            )
            .order_by(ShareLink.created_at.asc())
        )
        sharelinks = list((await self.db.execute(stmt)).scalars().all())
        return await self._finish_read(sharelinks)

    async def update_gallery(self, gallery_id: uuid.UUID, owner_id: uuid.UUID, name: str | None = None, shooting_date: date | None = None) -> Gallery | None:
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
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
                    Photo.status == PhotoUploadStatus.SUCCESSFUL,
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
                    Photo.status == PhotoUploadStatus.SUCCESSFUL,
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

    async def get_photo_count_by_gallery(self, gallery_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False))
        count = int((await self.db.execute(stmt)).scalar() or 0)
        return await self._finish_read(count)

    async def get_photos_by_gallery_paginated(self, gallery_id: uuid.UUID, limit: int, offset: int) -> list[Photo]:
        stmt = select(Photo).join(Photo.gallery).where(Photo.gallery_id == gallery_id, Gallery.is_deleted.is_(False)).order_by(Photo.display_name.asc()).offset(offset).limit(limit)
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
                    stem, suffix = self._split_name_and_ext(candidate)

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
        if photo.status == PhotoUploadStatus.SUCCESSFUL:
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

    async def create_sharelink(self, gallery_id: uuid.UUID, expires_at: datetime | None) -> ShareLink:
        sharelink = ShareLink(gallery_id=gallery_id, expires_at=expires_at, created_at=datetime.now(UTC))
        self.db.add(sharelink)
        await self.db.commit()
        await self.db.refresh(sharelink)
        return sharelink

    async def delete_sharelink(self, sharelink_id: uuid.UUID, gallery_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
        # First verify gallery ownership
        gallery = await self.get_gallery_by_id_and_owner(gallery_id, owner_id)
        if not gallery:
            return False

        # Then find and delete the sharelink
        stmt = select(ShareLink).where(ShareLink.id == sharelink_id, ShareLink.gallery_id == gallery_id)
        sharelink = (await self.db.execute(stmt)).scalar_one_or_none()
        if not sharelink:
            return False

        await self.db.delete(sharelink)
        await self.db.commit()
        return True
