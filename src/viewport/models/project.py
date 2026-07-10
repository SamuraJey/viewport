import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH
from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.gallery import Gallery, Photo
    from viewport.models.sharelink import ShareLink


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(GALLERY_NAME_MAX_LENGTH), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    shooting_date: Mapped[date] = mapped_column(Date, nullable=False, default=lambda: datetime.now(UTC).date())
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Optional cover photo for project-level public hero display
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", name="projects_cover_photo_id_fkey", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    # Public project appearance settings (mirrors Gallery for project-scoped shares)
    cover_focal_x: Mapped[float] = mapped_column(Float, nullable=False, default=50.0, server_default="50")
    cover_focal_y: Mapped[float] = mapped_column(Float, nullable=False, default=50.0, server_default="50")
    cover_display_option: Mapped[str] = mapped_column(String(32), nullable=False, default="centered_title", server_default="centered_title")
    public_photo_spacing: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")
    public_color_scheme: Mapped[str] = mapped_column(String(16), nullable=False, default="light", server_default="light")

    owner = relationship("User", back_populates="projects")
    # Optional relationship to the cover photo (may be None)
    cover_photo: Mapped["Photo | None"] = relationship(
        "Photo",
        primaryjoin="Project.cover_photo_id==Photo.id",
        foreign_keys="Project.cover_photo_id",
        uselist=False,
        viewonly=True,
    )
    galleries: Mapped[list["Gallery"]] = relationship(
        "Gallery",
        back_populates="project",
        passive_deletes=True,
        order_by="Gallery.project_position",
    )
    share_links: Mapped[list["ShareLink"]] = relationship(
        "ShareLink",
        back_populates="project",
        passive_deletes=True,
    )
    __table_args__ = (
        CheckConstraint("cover_focal_x >= 0 AND cover_focal_x <= 100", name="ck_projects_cover_focal_x_range"),
        CheckConstraint("cover_focal_y >= 0 AND cover_focal_y <= 100", name="ck_projects_cover_focal_y_range"),
        CheckConstraint("cover_display_option IN ('centered_title', 'text_block', 'minimalist')", name="ck_projects_cover_display_option"),
        CheckConstraint("public_photo_spacing IN ('small', 'medium', 'large')", name="ck_projects_public_photo_spacing"),
        CheckConstraint("public_color_scheme IN ('light', 'dark')", name="ck_projects_public_color_scheme"),
    )
