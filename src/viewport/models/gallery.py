import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, relationship

from src.viewport.db import Base


class Gallery(Base):
    __tablename__ = "galleries"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    owner_id = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = mapped_column(String, nullable=False, default="")  # Custom name for the gallery
    created_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    owner = relationship("User", back_populates="galleries")
    photos = relationship("Photo", back_populates="gallery", passive_deletes=True)
    share_links = relationship("ShareLink", back_populates="gallery", passive_deletes=True)


class Photo(Base):
    __tablename__ = "photos"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id = mapped_column(UUID(as_uuid=True), ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False)
    # S3 object key (e.g., gallery_id/filename)
    object_key = mapped_column(String, nullable=False)
    file_size = mapped_column(Integer, nullable=False)
    uploaded_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    gallery = relationship(Gallery, back_populates="photos")
