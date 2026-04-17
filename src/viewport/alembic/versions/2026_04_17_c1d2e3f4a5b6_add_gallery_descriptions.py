"""add gallery descriptions

Revision ID: c1d2e3f4a5b6
Revises: 9c4a7e2b1d3f
Create Date: 2026-04-17 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "9c4a7e2b1d3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("galleries", sa.Column("private_notes", sa.Text(), nullable=True))
    op.add_column("galleries", sa.Column("public_description", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("galleries", "public_description")
    op.drop_column("galleries", "private_notes")
