"""add refresh token sessions

Revision ID: d4e5f6a7b8c9
Revises: c7d8e9f0a1b2
Create Date: 2026-08-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_token_sessions",
        sa.Column("jti_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_jti_hash", sa.String(length=64), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_jti_hash", sa.String(length=64), nullable=True),
        sa.CheckConstraint("expires_at > issued_at", name="ck_refresh_token_sessions_expiry_after_issue"),
        sa.CheckConstraint("length(jti_hash) = 64", name="ck_refresh_token_sessions_jti_hash_length"),
        sa.CheckConstraint(
            "parent_jti_hash IS NULL OR length(parent_jti_hash) = 64",
            name="ck_refresh_token_sessions_parent_hash_length",
        ),
        sa.CheckConstraint(
            "replaced_by_jti_hash IS NULL OR length(replaced_by_jti_hash) = 64",
            name="ck_refresh_token_sessions_replacement_hash_length",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("jti_hash"),
    )
    op.create_index("ix_refresh_token_sessions_expires_at", "refresh_token_sessions", ["expires_at"], unique=False)
    op.create_index("ix_refresh_token_sessions_family_id", "refresh_token_sessions", ["family_id"], unique=False)
    op.create_index(
        "ix_refresh_token_sessions_revoked_at",
        "refresh_token_sessions",
        ["revoked_at"],
        unique=False,
        postgresql_where=sa.text("revoked_at IS NOT NULL"),
    )
    op.create_index(
        "ix_refresh_token_sessions_user_active",
        "refresh_token_sessions",
        ["user_id", "expires_at"],
        unique=False,
        postgresql_where=sa.text("used_at IS NULL AND revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_token_sessions_user_active", table_name="refresh_token_sessions")
    op.drop_index("ix_refresh_token_sessions_revoked_at", table_name="refresh_token_sessions")
    op.drop_index("ix_refresh_token_sessions_family_id", table_name="refresh_token_sessions")
    op.drop_index("ix_refresh_token_sessions_expires_at", table_name="refresh_token_sessions")
    op.drop_table("refresh_token_sessions")
