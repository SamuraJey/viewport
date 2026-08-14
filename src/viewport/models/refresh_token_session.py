import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from viewport.models.db import Base

if TYPE_CHECKING:
    from viewport.models.user import User


class RefreshTokenSession(Base):
    """Durable, hashed state for one single-use refresh token."""

    __tablename__ = "refresh_token_sessions"

    jti_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    parent_jti_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_jti_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="refresh_token_sessions")

    __table_args__ = (
        CheckConstraint("expires_at > issued_at", name="ck_refresh_token_sessions_expiry_after_issue"),
        CheckConstraint("length(jti_hash) = 64", name="ck_refresh_token_sessions_jti_hash_length"),
        CheckConstraint(
            "parent_jti_hash IS NULL OR length(parent_jti_hash) = 64",
            name="ck_refresh_token_sessions_parent_hash_length",
        ),
        CheckConstraint(
            "replaced_by_jti_hash IS NULL OR length(replaced_by_jti_hash) = 64",
            name="ck_refresh_token_sessions_replacement_hash_length",
        ),
        Index("ix_refresh_token_sessions_family_id", "family_id"),
        Index(
            "ix_refresh_token_sessions_user_active",
            "user_id",
            "expires_at",
            postgresql_where=text("used_at IS NULL AND revoked_at IS NULL"),
        ),
        Index("ix_refresh_token_sessions_expires_at", "expires_at"),
        Index(
            "ix_refresh_token_sessions_revoked_at",
            "revoked_at",
            postgresql_where=text("revoked_at IS NOT NULL"),
        ),
    )
