"""add unique photo name per gallery

Revision ID: b1c2d3e4f5a6
Revises: 0d8b5cd635e9
Create Date: 2026-02-28 00:00:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "0d8b5cd635e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_photos_gallery_id_object_key", "photos", ["gallery_id", "object_key"])


def downgrade() -> None:
    op.drop_constraint("uq_photos_gallery_id_object_key", "photos", type_="unique")
