"""backfill orphan galleries into projects

Revision ID: 8d9e7f6a5b4c
Revises: f1a2b3c4d5e6
Create Date: 2026-04-19 10:30:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8d9e7f6a5b4c"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


projects_table = sa.table(
    "projects",
    sa.column("id", sa.UUID()),
    sa.column("owner_id", sa.UUID()),
    sa.column("name", sa.String(length=128)),
    sa.column("created_at", sa.DateTime()),
    sa.column("shooting_date", sa.Date()),
    sa.column("is_deleted", sa.Boolean()),
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    orphan_galleries = list(
        bind.execute(
            sa.text(
                """
                SELECT id, owner_id, name, created_at, shooting_date
                FROM galleries
                WHERE project_id IS NULL
                  AND is_deleted = false
                """
            )
        ).mappings()
    )
    if not orphan_galleries:
        return

    for gallery in orphan_galleries:
        project_id = uuid.uuid4()
        bind.execute(
            projects_table.insert().values(
                id=project_id,
                owner_id=gallery["owner_id"],
                name=gallery["name"],
                created_at=gallery["created_at"],
                shooting_date=gallery["shooting_date"],
                is_deleted=False,
            )
        )
        bind.execute(
            sa.text(
                """
                UPDATE galleries
                SET project_id = :project_id,
                    project_position = 0,
                    project_visibility = 'listed'
                WHERE id = :gallery_id
                """
            ),
            {"project_id": project_id, "gallery_id": gallery["id"]},
        )


def downgrade() -> None:
    """Downgrade schema."""
    # Irreversible data backfill. The previous schema revision remains compatible
    # with the populated project references, and earlier downgrades remove the
    # project/galleries linkage columns entirely.
    return None
