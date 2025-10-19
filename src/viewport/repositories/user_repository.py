import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
