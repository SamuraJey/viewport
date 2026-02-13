"""fix_cover_photo_fk_ondelete

Revision ID: 0d8b5cd635e9
Revises: 5b3f2a1c9d0e
Create Date: 2026-02-10 00:45:45.137506

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0d8b5cd635e9'
down_revision: Union[str, Sequence[str], None] = '5b3f2a1c9d0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop the existing FK
    op.drop_constraint("galleries_cover_photo_id_fkey", "galleries", type_="foreignkey")
    # Recreate with SET NULL on delete
    op.create_foreign_key(
        "galleries_cover_photo_id_fkey",
        "galleries",
        "photos",
        ["cover_photo_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop the FK
    op.drop_constraint("galleries_cover_photo_id_fkey", "galleries", type_="foreignkey")
    # Recreate without ondelete (default no action)
    op.create_foreign_key(
        "galleries_cover_photo_id_fkey",
        "galleries",
        "photos",
        ["cover_photo_id"],
        ["id"],
    )
