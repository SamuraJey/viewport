"""allow multiple selection sessions per share link

Revision ID: 9c4a7e2b1d3f
Revises: b8d2e6f4a1c9
Create Date: 2026-04-01 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c4a7e2b1d3f"
down_revision: str | Sequence[str] | None = "b8d2e6f4a1c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TABLE share_link_selection_sessions "
        "DROP CONSTRAINT IF EXISTS share_link_selection_sessions_sharelink_id_key"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_share_link_selection_sessions_sharelink_id "
        "ON share_link_selection_sessions (sharelink_id)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_share_link_selection_sessions_sharelink_id")
    op.execute(
        "ALTER TABLE share_link_selection_sessions "
        "ADD CONSTRAINT share_link_selection_sessions_sharelink_id_key UNIQUE (sharelink_id)"
    )
