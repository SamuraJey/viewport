"""add projects and scope-based share links

Revision ID: f1a2b3c4d5e6
Revises: 9c4a7e2b1d3f
Create Date: 2026-04-18 06:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "9c4a7e2b1d3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "projects",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("shooting_date", sa.Date(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)

    op.add_column("galleries", sa.Column("project_id", sa.UUID(), nullable=True))
    op.add_column("galleries", sa.Column("project_position", sa.Integer(), server_default="0", nullable=False))
    op.add_column(
        "galleries",
        sa.Column("project_visibility", sa.String(length=16), server_default="listed", nullable=False),
    )
    op.create_index(op.f("ix_galleries_project_id"), "galleries", ["project_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_galleries_project_id_projects"),
        "galleries",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_galleries_project_visibility",
        "galleries",
        "project_visibility IN ('listed', 'direct_only')",
    )

    op.add_column("share_links", sa.Column("project_id", sa.UUID(), nullable=True))
    op.add_column(
        "share_links",
        sa.Column("scope_type", sa.String(length=16), server_default="gallery", nullable=False),
    )
    op.create_index(op.f("ix_share_links_project_id"), "share_links", ["project_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_share_links_project_id_projects"),
        "share_links",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute("UPDATE share_links SET scope_type = 'gallery' WHERE scope_type IS NULL")
    op.alter_column("share_links", "gallery_id", existing_type=sa.UUID(), nullable=True)
    op.create_check_constraint(
        "ck_share_links_scope_type",
        "share_links",
        "scope_type IN ('gallery', 'project')",
    )
    op.create_check_constraint(
        "ck_share_links_scope_target_match",
        "share_links",
        "(scope_type = 'gallery' AND gallery_id IS NOT NULL AND project_id IS NULL) OR "
        "(scope_type = 'project' AND project_id IS NOT NULL AND gallery_id IS NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_share_links_scope_target_match", "share_links", type_="check")
    op.drop_constraint("ck_share_links_scope_type", "share_links", type_="check")
    op.alter_column("share_links", "gallery_id", existing_type=sa.UUID(), nullable=False)
    op.drop_constraint(op.f("fk_share_links_project_id_projects"), "share_links", type_="foreignkey")
    op.drop_index(op.f("ix_share_links_project_id"), table_name="share_links")
    op.drop_column("share_links", "scope_type")
    op.drop_column("share_links", "project_id")

    op.drop_constraint("ck_galleries_project_visibility", "galleries", type_="check")
    op.drop_constraint(op.f("fk_galleries_project_id_projects"), "galleries", type_="foreignkey")
    op.drop_index(op.f("ix_galleries_project_id"), table_name="galleries")
    op.drop_column("galleries", "project_visibility")
    op.drop_column("galleries", "project_position")
    op.drop_column("galleries", "project_id")

    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_table("projects")
