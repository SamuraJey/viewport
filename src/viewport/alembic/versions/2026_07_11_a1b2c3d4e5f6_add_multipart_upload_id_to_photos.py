"""add multipart upload id to photos

Revision ID: a1b2c3d4e5f6
Revises: 78f6a5e87b23
Create Date: 2026-07-11 23:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '78f6a5e87b23'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('photos', sa.Column('multipart_upload_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('photos', 'multipart_upload_id')
