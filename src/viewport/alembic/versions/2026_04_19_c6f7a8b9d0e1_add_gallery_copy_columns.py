"""add gallery copy columns

Revision ID: c6f7a8b9d0e1
Revises: 8d9e7f6a5b4c
Create Date: 2026-04-19 17:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c6f7a8b9d0e1"
down_revision: str | Sequence[str] | None = "8d9e7f6a5b4c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE galleries ADD COLUMN IF NOT EXISTS private_notes TEXT")
    op.execute("ALTER TABLE galleries ADD COLUMN IF NOT EXISTS public_description TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS public_description")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS private_notes")
