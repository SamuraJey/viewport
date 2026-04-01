"""add share link selection tables

Revision ID: b8d2e6f4a1c9
Revises: e5b2b1912b0d
Create Date: 2026-03-31 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8d2e6f4a1c9"
down_revision: str | Sequence[str] | None = "e5b2b1912b0d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "share_link_selection_configs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("sharelink_id", sa.UUID(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("list_title", sa.String(length=127), server_default="Selected photos", nullable=False),
        sa.Column("limit_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("limit_value", sa.Integer(), nullable=True),
        sa.Column("allow_photo_comments", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("require_name", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("require_email", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("require_phone", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("require_client_note", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(NOT limit_enabled) OR (limit_value IS NOT NULL AND limit_value > 0)",
            name="ck_share_link_selection_configs_limit_value",
        ),
        sa.ForeignKeyConstraint(["sharelink_id"], ["share_links.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_share_link_selection_configs_sharelink_id"),
        "share_link_selection_configs",
        ["sharelink_id"],
        unique=True,
    )

    op.create_table(
        "share_link_selection_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("sharelink_id", sa.UUID(), nullable=False),
        sa.Column("config_id", sa.UUID(), nullable=False),
        sa.Column("client_name", sa.String(length=127), nullable=False),
        sa.Column("client_email", sa.String(length=255), nullable=True),
        sa.Column("client_phone", sa.String(length=32), nullable=True),
        sa.Column("client_note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="in_progress", nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False),
        sa.Column("selected_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("resume_token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('in_progress', 'submitted', 'closed')",
            name="ck_share_link_selection_sessions_status",
        ),
        sa.CheckConstraint(
            "selected_count >= 0",
            name="ck_share_link_selection_sessions_selected_count_non_negative",
        ),
        sa.ForeignKeyConstraint(["config_id"], ["share_link_selection_configs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sharelink_id"], ["share_links.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resume_token_hash"),
        sa.UniqueConstraint("sharelink_id"),
    )
    op.create_index(
        "ix_share_link_selection_sessions_status_updated_at",
        "share_link_selection_sessions",
        ["status", "updated_at"],
        unique=False,
    )

    op.create_table(
        "share_link_selection_items",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("photo_id", sa.UUID(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("selected_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["share_link_selection_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id", "photo_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("share_link_selection_items")
    op.drop_index("ix_share_link_selection_sessions_status_updated_at", table_name="share_link_selection_sessions")
    op.drop_table("share_link_selection_sessions")
    op.drop_index(op.f("ix_share_link_selection_configs_sharelink_id"), table_name="share_link_selection_configs")
    op.drop_table("share_link_selection_configs")
