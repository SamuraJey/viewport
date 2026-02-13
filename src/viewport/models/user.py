import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from .gallery import Gallery


class User(Base):
    __tablename__ = "users"

    DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # new: optional display name
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # Admin flag for admin panel access
    storage_quota: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=DEFAULT_STORAGE_QUOTA_BYTES,
        server_default=str(DEFAULT_STORAGE_QUOTA_BYTES),
    )
    storage_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    storage_reserved: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")

    galleries: Mapped[list["Gallery"]] = relationship("Gallery", back_populates="owner", passive_deletes=True)
