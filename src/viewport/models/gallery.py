import uuid
from datetime import UTC, date, datetime
from enum import IntEnum, StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, event, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH, PUBLIC_GALLERY_SORT_BY_DEFAULT, PUBLIC_GALLERY_SORT_ORDER_DEFAULT
from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.project import Project
    from viewport.models.sharelink import ShareLink


class PhotoUploadStatus(IntEnum):
    """Status of photo upload process (integer mapping)"""

    PENDING = 1  # Presigned URL issued, awaiting upload
    SUCCESSFUL = 2  # File successfully uploaded to S3
    FAILED = 3  # Upload failed
    THUMBNAIL_CREATING = 4  # Upload confirmed, thumbnail generation in progress


class ProjectVisibility(StrEnum):
    LISTED = "listed"
    DIRECT_ONLY = "direct_only"


class Gallery(Base):
    __tablename__ = "galleries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(GALLERY_NAME_MAX_LENGTH), nullable=False, default="")  # Custom name for the gallery
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    project_position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    project_visibility: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ProjectVisibility.LISTED.value,
        server_default=ProjectVisibility.LISTED.value,
    )
    # Displayed shooting date (defaults to gallery creation date)
    shooting_date: Mapped[date] = mapped_column(Date, nullable=False, default=lambda: datetime.now(UTC).date())
    # Controls default sorting for shared/public gallery views.
    public_sort_by: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=PUBLIC_GALLERY_SORT_BY_DEFAULT,
        server_default=PUBLIC_GALLERY_SORT_BY_DEFAULT,
    )
    public_sort_order: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default=PUBLIC_GALLERY_SORT_ORDER_DEFAULT,
        server_default=PUBLIC_GALLERY_SORT_ORDER_DEFAULT,
    )
    private_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional cover photo for public display
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", name="galleries_cover_photo_id_fkey", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    owner = relationship("User", back_populates="galleries")
    project: Mapped["Project | None"] = relationship("Project", back_populates="galleries")
    # Disambiguate relationship via Photo.gallery_id
    photos = relationship(
        "Photo",
        back_populates="gallery",
        passive_deletes=True,
        foreign_keys="Photo.gallery_id",
        order_by="Photo.display_name",
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

    __table_args__ = (
        CheckConstraint(
            "project_visibility IN ('listed', 'direct_only')",
            name="ck_galleries_project_visibility",
        ),
    )


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
    # Original filename of the uploaded photo
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_object_key: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional stored dimensions (filled from S3 metadata during upload)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    # Disambiguate relationship via this model's gallery_id
    gallery: Mapped["Gallery"] = relationship("Gallery", back_populates="photos", foreign_keys=[gallery_id])

    __table_args__ = (
        Index(
            "ix_photos_gallery_id_display_name_lower",
            gallery_id,
            func.lower(display_name),
            unique=True,
        ),
        Index(
            "ix_photos_gallery_id_uploaded_at",
            gallery_id,
            uploaded_at,
        ),
    )


@event.listens_for(Photo, "before_insert")
def _set_default_display_name_before_insert(_, __, target: Photo) -> None:
    if target.display_name:
        return
    object_key = target.object_key or ""
    target.display_name = object_key.split("/", 1)[1] if "/" in object_key else (object_key or "file")
