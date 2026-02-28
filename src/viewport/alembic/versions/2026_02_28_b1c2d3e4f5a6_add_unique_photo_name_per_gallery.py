"""add_unique_photo_name_per_gallery

Revision ID: b1c2d3e4f5a6
Revises: 0d8b5cd635e9
Create Date: 2026-02-28 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "0d8b5cd635e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint("uq_photos_gallery_id_object_key", "photos", ["gallery_id", "object_key"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_photos_gallery_id_object_key", "photos", type_="unique")
