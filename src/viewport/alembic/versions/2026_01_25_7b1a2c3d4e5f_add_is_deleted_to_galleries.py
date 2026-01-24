"""Add galleries.is_deleted

Revision ID: 7b1a2c3d4e5f
Revises: 0d1edea3e426
Create Date: 2026-01-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b1a2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "0d1edea3e426"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("galleries", sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("galleries", "is_deleted")
