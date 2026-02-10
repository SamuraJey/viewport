import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    def create_user(self, email: str, password_hash: str) -> User:
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
        )
        self.db.add(user)
        try:
            self.db.commit()
            self.db.refresh(user)
        except IntegrityError:
            self.db.rollback()
            raise
        return user

    def get_user_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_user_by_id(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def update_user_display_name(self, user_id: uuid.UUID, display_name: str | None) -> User | None:
        user = self.get_user_by_id(user_id)
        if not user:
            return None
        user.display_name = display_name
        self.db.add(user)
        try:
            self.db.commit()
            self.db.refresh(user)
        except IntegrityError:
            self.db.rollback()
            raise
        return user

    def update_user_password(self, user_id: uuid.UUID, password_hash: str) -> User | None:
        user = self.get_user_by_id(user_id)
        if not user:
            return None
        user.password_hash = password_hash
        self.db.add(user)
        try:
            self.db.commit()
            self.db.refresh(user)
        except IntegrityError:
            self.db.rollback()
            raise
        return user

    def reserve_storage(self, user_id: uuid.UUID, bytes_to_reserve: int) -> bool:
        if bytes_to_reserve <= 0:
            return True

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = self.db.execute(stmt).scalar_one_or_none()
        if not user:
            return False

        available = user.storage_quota - user.storage_used - user.storage_reserved
        if bytes_to_reserve > available:
            self.db.rollback()
            return False

        user.storage_reserved += bytes_to_reserve
        self.db.add(user)
        self.db.commit()
        return True

    def release_reserved_storage(self, user_id: uuid.UUID, bytes_to_release: int) -> None:
        if bytes_to_release <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = self.db.execute(stmt).scalar_one_or_none()
        if not user:
            return

        user.storage_reserved = max(user.storage_reserved - bytes_to_release, 0)
        self.db.add(user)
        self.db.commit()

    def finalize_reserved_storage(self, user_id: uuid.UUID, bytes_to_finalize: int) -> None:
        if bytes_to_finalize <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = self.db.execute(stmt).scalar_one_or_none()
        if not user:
            return

        user.storage_reserved = max(user.storage_reserved - bytes_to_finalize, 0)
        user.storage_used += bytes_to_finalize
        self.db.add(user)
        self.db.commit()

    def decrement_storage_used(self, user_id: uuid.UUID, bytes_to_decrement: int) -> None:
        if bytes_to_decrement <= 0:
            return

        stmt = select(User).where(User.id == user_id).with_for_update()
        user = self.db.execute(stmt).scalar_one_or_none()
        if not user:
            return

        user.storage_used = max(user.storage_used - bytes_to_decrement, 0)
        self.db.add(user)
        self.db.commit()

    def recalculate_storage(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id).with_for_update()
        user = self.db.execute(stmt).scalar_one_or_none()
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

        user.storage_used = int(self.db.execute(used_stmt).scalar_one())
        user.storage_reserved = int(self.db.execute(reserved_stmt).scalar_one())
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
