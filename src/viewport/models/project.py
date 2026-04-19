import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH
from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.gallery import Gallery
    from viewport.models.sharelink import ShareLink


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(GALLERY_NAME_MAX_LENGTH), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    shooting_date: Mapped[date] = mapped_column(Date, nullable=False, default=lambda: datetime.now(UTC).date())
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    owner = relationship("User", back_populates="projects")
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
