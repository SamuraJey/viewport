"""add display_name to users

Revision ID: 4b56789abcde
Revises: d1f2e3c4b5a6
Create Date: 2025-08-16 19:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '4b56789abcde'
down_revision = 'd1f2e3c4b5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('display_name', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'display_name')
