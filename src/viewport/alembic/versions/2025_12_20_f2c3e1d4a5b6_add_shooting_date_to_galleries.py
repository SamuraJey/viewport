"""add shooting_date to galleries

Revision ID: f2c3e1d4a5b6
Revises: a0f8465ec9b0
Create Date: 2025-12-20
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f2c3e1d4a5b6'
down_revision = 'a0f8465ec9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'galleries',
        sa.Column('shooting_date', sa.Date(), nullable=True, server_default=sa.text('CURRENT_DATE')),
    )
    # Backfill existing rows to match their creation date
    op.execute("UPDATE galleries SET shooting_date = COALESCE(created_at::date, CURRENT_DATE)")
    op.alter_column('galleries', 'shooting_date', nullable=False)


def downgrade() -> None:
    op.drop_column('galleries', 'shooting_date')
