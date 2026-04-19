import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.gallery import Gallery
    from viewport.models.project import Project
    from viewport.models.sharelink_selection import ShareLinkSelectionConfig, ShareLinkSelectionSession


class ShareScopeType(StrEnum):
    GALLERY = "gallery"
    PROJECT = "project"


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("galleries.id", ondelete="CASCADE"), nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scope_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ShareScopeType.GALLERY.value,
        server_default=ShareScopeType.GALLERY.value,
    )
    label: Mapped[str | None] = mapped_column(String(127), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    zip_downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    single_downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    gallery: Mapped["Gallery | None"] = relationship("Gallery", back_populates="share_links")
    project: Mapped["Project | None"] = relationship("Project", back_populates="share_links")
    selection_config: Mapped["ShareLinkSelectionConfig | None"] = relationship(
        "ShareLinkSelectionConfig",
        back_populates="sharelink",
        uselist=False,
        passive_deletes=True,
    )
    selection_sessions: Mapped[list["ShareLinkSelectionSession"]] = relationship(
        "ShareLinkSelectionSession",
        back_populates="sharelink",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('gallery', 'project')",
            name="ck_share_links_scope_type",
        ),
        CheckConstraint(
            "(scope_type = 'gallery' AND gallery_id IS NOT NULL AND project_id IS NULL) OR (scope_type = 'project' AND project_id IS NOT NULL AND gallery_id IS NULL)",
            name="ck_share_links_scope_target_match",
        ),
    )
