"""add photo width/height

Revision ID: c92e4b61bba9
Revises: 9a8b7c6d5e4f
Create Date: 2025-09-20 23:37:02.067102

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c92e4b61bba9'
down_revision: Union[str, Sequence[str], None] = '9a8b7c6d5e4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add nullable width and height columns to photos table
    op.add_column('photos', sa.Column('width', sa.Integer(), nullable=True))
    op.add_column('photos', sa.Column('height', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove the columns added in upgrade
    op.drop_column('photos', 'height')
    op.drop_column('photos', 'width')
