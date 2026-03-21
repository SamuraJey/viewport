"""limit gallery name length

Revision ID: b7c1d5e9a2f4
Revises: 17a031c9d6cd
Create Date: 2026-03-13 23:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c1d5e9a2f4"
down_revision: str | Sequence[str] | None = "17a031c9d6cd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Truncate overlong names before tightening the column type.
    op.execute("UPDATE galleries SET name = LEFT(name, 128) WHERE char_length(name) > 128")
    op.alter_column(
        "galleries",
        "name",
        existing_type=sa.String(),
        type_=sa.String(length=128),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "galleries",
        "name",
        existing_type=sa.String(length=128),
        type_=sa.String(),
        existing_nullable=False,
    )
