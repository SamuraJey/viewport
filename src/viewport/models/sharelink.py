import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.gallery import Gallery
    from viewport.models.sharelink_selection import ShareLinkSelectionConfig, ShareLinkSelectionSession


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str | None] = mapped_column(String(127), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    zip_downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    single_downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    gallery: Mapped["Gallery"] = relationship("Gallery", back_populates="share_links")
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
