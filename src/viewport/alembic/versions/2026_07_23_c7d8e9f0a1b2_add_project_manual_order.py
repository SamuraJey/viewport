"""add project manual order

Revision ID: c7d8e9f0a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-23 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("manual_order", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH ranked_projects AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_id
                    ORDER BY created_at DESC, id DESC
                ) - 1 AS position
            FROM projects
            WHERE is_deleted = false
        )
        UPDATE projects
        SET manual_order = ranked_projects.position
        FROM ranked_projects
        WHERE projects.id = ranked_projects.id
        """
    )
    op.execute("UPDATE projects SET manual_order = 0 WHERE manual_order IS NULL")
    op.alter_column(
        "projects",
        "manual_order",
        existing_type=sa.Integer(),
        nullable=False,
        server_default="0",
    )
    op.create_index(
        "ix_projects_owner_manual_order",
        "projects",
        ["owner_id", "manual_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_projects_owner_manual_order", table_name="projects")
    op.drop_column("projects", "manual_order")
