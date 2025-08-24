"""add cover_photo_id to galleries

Revision ID: 9a8b7c6d5e4f
Revises: 4b56789abcde
Create Date: 2025-08-23 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9a8b7c6d5e4f"
down_revision: Union[str, Sequence[str], None] = "4b56789abcde"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable cover_photo_id column
    op.add_column("galleries", sa.Column("cover_photo_id", sa.UUID(), nullable=True))
    # Create foreign key to photos with SET NULL on delete
    op.create_foreign_key(
        "galleries_cover_photo_id_fkey",
        "galleries",
        "photos",
        ["cover_photo_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Drop FK then column
    op.drop_constraint("galleries_cover_photo_id_fkey", "galleries", type_="foreignkey")
    op.drop_column("galleries", "cover_photo_id")
