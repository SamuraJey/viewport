import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from viewport.models.db import Base


class ShareLinkDailyStat(Base):
    __tablename__ = "share_link_daily_stats"

    sharelink_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("share_links.id", ondelete="CASCADE"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    views_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    views_unique: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    zip_downloads: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    single_downloads: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    __table_args__ = (PrimaryKeyConstraint("sharelink_id", "day", name="pk_share_link_daily_stats"),)


class ShareLinkDailyVisitor(Base):
    __tablename__ = "share_link_daily_visitors"

    sharelink_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("share_links.id", ondelete="CASCADE"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    visitor_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

    __table_args__ = (PrimaryKeyConstraint("sharelink_id", "day", "visitor_hash", name="pk_share_link_daily_visitors"),)
