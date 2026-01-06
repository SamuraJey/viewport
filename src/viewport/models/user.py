import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, relationship

from viewport.models.db import Base


class User(Base):
    __tablename__ = "users"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    email = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash = mapped_column(String(255), nullable=False)
    created_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    display_name = mapped_column(String(255), nullable=True)  # new: optional display name
    is_admin = mapped_column(Boolean, default=False, nullable=False)  # Admin flag for admin panel access

    galleries = relationship("Gallery", back_populates="owner", passive_deletes=True)
