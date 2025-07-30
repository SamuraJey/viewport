import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column

from src.viewport.db import Base


class User(Base):
    __tablename__ = "users"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    email = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash = mapped_column(String(255), nullable=False)
    created_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
