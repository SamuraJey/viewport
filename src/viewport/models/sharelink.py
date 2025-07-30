import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, relationship

from src.viewport.db import Base


class ShareLink(Base):
    __tablename__ = "share_links"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id = mapped_column(UUID(as_uuid=True), ForeignKey("galleries.id"), nullable=False)
    expires_at = mapped_column(DateTime, nullable=True)
    views = mapped_column(Integer, default=0, nullable=False)
    zip_downloads = mapped_column(Integer, default=0, nullable=False)
    single_downloads = mapped_column(Integer, default=0, nullable=False)
    created_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    gallery = relationship("Gallery", back_populates="share_links")
