import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.gallery import Photo
    from viewport.models.sharelink import ShareLink


class SelectionSessionStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    CLOSED = "closed"


class ShareLinkSelectionConfig(Base):
    __tablename__ = "share_link_selection_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sharelink_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("share_links.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    list_title: Mapped[str] = mapped_column(String(127), nullable=False, default="Selected photos", server_default="Selected photos")
    limit_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    limit_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allow_photo_comments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    require_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    require_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    require_phone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    require_client_note: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    sharelink: Mapped["ShareLink"] = relationship("ShareLink", back_populates="selection_config")
    sessions: Mapped[list["ShareLinkSelectionSession"]] = relationship(
        "ShareLinkSelectionSession",
        back_populates="config",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "(NOT limit_enabled) OR (limit_value IS NOT NULL AND limit_value > 0)",
            name="ck_share_link_selection_configs_limit_value",
        ),
    )


class ShareLinkSelectionSession(Base):
    __tablename__ = "share_link_selection_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sharelink_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("share_links.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("share_link_selection_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_name: Mapped[str] = mapped_column(String(127), nullable=False)
    client_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    client_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=SelectionSessionStatus.IN_PROGRESS.value, server_default=SelectionSessionStatus.IN_PROGRESS.value)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    selected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    resume_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    sharelink: Mapped["ShareLink"] = relationship("ShareLink", back_populates="selection_sessions")
    config: Mapped["ShareLinkSelectionConfig"] = relationship("ShareLinkSelectionConfig", back_populates="sessions")
    items: Mapped[list["ShareLinkSelectionItem"]] = relationship(
        "ShareLinkSelectionItem",
        back_populates="session",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('in_progress', 'submitted', 'closed')",
            name="ck_share_link_selection_sessions_status",
        ),
        CheckConstraint("selected_count >= 0", name="ck_share_link_selection_sessions_selected_count_non_negative"),
        Index(
            "ix_share_link_selection_sessions_status_updated_at",
            "status",
            "updated_at",
        ),
    )


class ShareLinkSelectionItem(Base):
    __tablename__ = "share_link_selection_items"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("share_link_selection_sessions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    session: Mapped["ShareLinkSelectionSession"] = relationship("ShareLinkSelectionSession", back_populates="items")
    photo: Mapped["Photo"] = relationship("Photo")
