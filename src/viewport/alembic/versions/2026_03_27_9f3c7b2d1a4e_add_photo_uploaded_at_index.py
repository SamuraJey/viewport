"""add photo uploaded_at index for gallery sorting

Revision ID: 9f3c7b2d1a4e
Revises: b7c1d5e9a2f4
Create Date: 2026-03-27 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f3c7b2d1a4e"
down_revision: str | None = "b7c1d5e9a2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_photos_gallery_id_uploaded_at",
        "photos",
        ["gallery_id", "uploaded_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_photos_gallery_id_uploaded_at", table_name="photos")
