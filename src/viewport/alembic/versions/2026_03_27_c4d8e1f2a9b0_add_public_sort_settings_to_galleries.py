"""add persisted public sort settings to galleries

Revision ID: c4d8e1f2a9b0
Revises: 9f3c7b2d1a4e
Create Date: 2026-03-27 12:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8e1f2a9b0"
down_revision: str | None = "9f3c7b2d1a4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "galleries",
        sa.Column("public_sort_by", sa.String(length=32), nullable=False, server_default="original_filename"),
    )
    op.add_column(
        "galleries",
        sa.Column("public_sort_order", sa.String(length=8), nullable=False, server_default="asc"),
    )


def downgrade() -> None:
    op.drop_column("galleries", "public_sort_order")
    op.drop_column("galleries", "public_sort_by")
