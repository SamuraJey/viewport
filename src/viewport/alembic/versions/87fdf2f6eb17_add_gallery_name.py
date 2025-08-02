"""add gallery name

Revision ID: 87fdf2f6eb17
Revises: 30d900cfc85e
Create Date: 2025-08-02 17:19:38.934374

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '87fdf2f6eb17'
down_revision: Union[str, Sequence[str], None] = '30d900cfc85e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add name column to galleries."""
    # Add 'name' column with default empty string
    op.add_column('galleries', sa.Column('name', sa.String(), nullable=False, server_default=""))
    # Remove server default to clean up schema
    op.alter_column('galleries', 'name', server_default=None)


def downgrade() -> None:
    """Downgrade schema: remove name column from galleries."""
    op.drop_column('galleries', 'name')
