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
    # Optional cover photo for public display
    cover_photo_id = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", name="galleries_cover_photo_id_fkey", ondelete="SET NULL"),
        nullable=True,
    )

    owner = relationship("User", back_populates="galleries")
    # Disambiguate relationship via Photo.gallery_id
    photos = relationship(
        "Photo",
        back_populates="gallery",
        passive_deletes=True,
        foreign_keys="Photo.gallery_id",
    )
    # Optional relationship to the cover photo (may be None)
    cover_photo = relationship(
        "Photo",
        primaryjoin="Gallery.cover_photo_id==Photo.id",
        foreign_keys="Gallery.cover_photo_id",
        uselist=False,
        viewonly=True,
    )
    share_links = relationship("ShareLink", back_populates="gallery", passive_deletes=True)
    # Relationship to the cover photo (may be None)
    # Note: This is a simple relationship; we avoid back_populates to prevent confusion.
    # The Photo model already has a relationship back to Gallery via gallery_id.
    # SQLAlchemy will resolve this foreign key correctly.


class Photo(Base):
    __tablename__ = "photos"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("galleries.id", name="photos_gallery_id_fkey", ondelete="CASCADE"),
        nullable=False,
    )
    # S3 object key (e.g., gallery_id/filename)
    object_key = mapped_column(String, nullable=False)
    file_size = mapped_column(Integer, nullable=False)
    uploaded_at = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    # Disambiguate relationship via this model's gallery_id
    gallery = relationship(Gallery, back_populates="photos", foreign_keys=[gallery_id])
