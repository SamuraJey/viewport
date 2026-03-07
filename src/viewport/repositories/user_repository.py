import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    async def create_user(self, email: str, password_hash: str) -> User:
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
        )
        self.db.add(user)
        try:
            await self.db.commit()
            await self.db.refresh(user)
        except IntegrityError:
            await self.db.rollback()
            raise
        return user

    async def get_user_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(user)

    async def get_user_by_id(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id)
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        return await self._finish_read(user)

    async def update_user_display_name(self, user_id: uuid.UUID, display_name: str | None) -> User | None:
        user = await self.get_user_by_id(user_id)
        if not user:
            return None
        user.display_name = display_name
        self.db.add(user)
        try:
            await self.db.commit()
            await self.db.refresh(user)
        except IntegrityError:
            await self.db.rollback()
            raise
        return user

    async def update_user_password(self, user_id: uuid.UUID, password_hash: str) -> User | None:
        user = await self.get_user_by_id(user_id)
        if not user:
            return None
        user.password_hash = password_hash
        self.db.add(user)
        try:
            await self.db.commit()
            await self.db.refresh(user)
        except IntegrityError:
            await self.db.rollback()
            raise
        return user

    async def reserve_storage(self, user_id: uuid.UUID, bytes_to_reserve: int) -> bool:
        if bytes_to_reserve <= 0:
            return True

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return False

        available = user.storage_quota - user.storage_used - user.storage_reserved
        if bytes_to_reserve > available:
            await self.db.rollback()
            return False

        user.storage_reserved += bytes_to_reserve
        self.db.add(user)
        await self.db.commit()
        return True

    async def release_reserved_storage(self, user_id: uuid.UUID, bytes_to_release: int, commit: bool = True) -> None:
        if bytes_to_release <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return

        user.storage_reserved = max(user.storage_reserved - bytes_to_release, 0)
        self.db.add(user)
        if commit:
            await self.db.commit()

    async def finalize_reserved_storage(self, user_id: uuid.UUID, bytes_to_finalize: int, commit: bool = True) -> None:
        if bytes_to_finalize <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return

        user.storage_reserved = max(user.storage_reserved - bytes_to_finalize, 0)
        user.storage_used += bytes_to_finalize
        self.db.add(user)
        if commit:
            await self.db.commit()

    async def finalize_and_release_reserved_storage(self, user_id: uuid.UUID, bytes_to_finalize: int, bytes_to_release: int, commit: bool = True) -> None:
        if bytes_to_finalize <= 0 and bytes_to_release <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return

        if bytes_to_finalize > 0:
            user.storage_reserved = max(user.storage_reserved - bytes_to_finalize, 0)
            user.storage_used += bytes_to_finalize

        if bytes_to_release > 0:
            user.storage_reserved = max(user.storage_reserved - bytes_to_release, 0)

        self.db.add(user)
        if commit:
            await self.db.commit()

    async def decrement_storage_used(self, user_id: uuid.UUID, bytes_to_decrement: int, commit: bool = True) -> None:
        if bytes_to_decrement <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return

        user.storage_used = max(user.storage_used - bytes_to_decrement, 0)
        self.db.add(user)
        if commit:
            await self.db.commit()

    async def recalculate_storage(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id).with_for_update()
        user = (await self.db.execute(stmt)).scalar_one_or_none()
        if not user:
            return None

        used_stmt = (
            select(func.coalesce(func.sum(Photo.file_size), 0))
            .join(Gallery, Photo.gallery_id == Gallery.id)
            .where(
                Gallery.owner_id == user_id,
                Gallery.is_deleted.is_(False),
                Photo.status == PhotoUploadStatus.SUCCESSFUL,
            )
        )
        reserved_stmt = (
            select(func.coalesce(func.sum(Photo.file_size), 0))
            .join(Gallery, Photo.gallery_id == Gallery.id)
            .where(
                Gallery.owner_id == user_id,
                Gallery.is_deleted.is_(False),
                Photo.status == PhotoUploadStatus.PENDING,
            )
        )

        user.storage_used = int((await self.db.execute(used_stmt)).scalar_one())
        user.storage_reserved = int((await self.db.execute(reserved_stmt)).scalar_one())
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
