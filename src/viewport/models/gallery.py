import uuid
from datetime import UTC, date, datetime
from enum import IntEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from .sharelink import ShareLink


class PhotoUploadStatus(IntEnum):
    """Status of photo upload process (integer mapping)"""

    PENDING = 1  # Presigned URL issued, awaiting upload
    SUCCESSFUL = 2  # File successfully uploaded to S3
    FAILED = 3  # Upload failed


class Gallery(Base):
    __tablename__ = "galleries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")  # Custom name for the gallery
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Displayed shooting date (defaults to gallery creation date)
    shooting_date: Mapped[date] = mapped_column(Date, nullable=False, default=lambda: datetime.now(UTC).date())
    # Optional cover photo for public display
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", name="galleries_cover_photo_id_fkey", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    owner = relationship("User", back_populates="galleries")
    # Disambiguate relationship via Photo.gallery_id
    photos = relationship(
        "Photo",
        back_populates="gallery",
        passive_deletes=True,
        foreign_keys="Photo.gallery_id",
        order_by="Photo.object_key",
    )
    # Optional relationship to the cover photo (may be None)
    cover_photo: Mapped["Photo | None"] = relationship(
        "Photo",
        primaryjoin="Gallery.cover_photo_id==Photo.id",
        foreign_keys="Gallery.cover_photo_id",
        uselist=False,
        viewonly=True,
    )
    share_links: Mapped[list["ShareLink"]] = relationship("ShareLink", back_populates="gallery", passive_deletes=True)
    # Relationship to the cover photo (may be None)
    # Note: This is a simple relationship; we avoid back_populates to prevent confusion.
    # The Photo model already has a relationship back to Gallery via gallery_id.
    # SQLAlchemy will resolve this foreign key correctly.


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("galleries.id", name="photos_gallery_id_fkey", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Upload status (pending, successful, failed)
    status: Mapped[PhotoUploadStatus] = mapped_column(
        SmallInteger,
        nullable=False,
        default=PhotoUploadStatus.PENDING,
        server_default=str(PhotoUploadStatus.PENDING.value),
    )
    # S3 object key (e.g., gallery_id/filename)
    object_key: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_object_key: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional stored dimensions (filled from S3 metadata during upload)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    # Disambiguate relationship via this model's gallery_id
    gallery: Mapped["Gallery"] = relationship("Gallery", back_populates="photos", foreign_keys=[gallery_id])
