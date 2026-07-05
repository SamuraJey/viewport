"""Add gallery appearance settings columns and constraints.

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9d0e1f2
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "galleries",
        sa.Column(
            "cover_focal_x",
            sa.Float(),
            nullable=False,
            server_default="50",
        ),
    )
    op.add_column(
        "galleries",
        sa.Column(
            "cover_focal_y",
            sa.Float(),
            nullable=False,
            server_default="50",
        ),
    )
    op.add_column(
        "galleries",
        sa.Column(
            "cover_display_option",
            sa.String(length=32),
            nullable=False,
            server_default="centered_title",
        ),
    )
    op.add_column(
        "galleries",
        sa.Column(
            "public_photo_spacing",
            sa.String(length=16),
            nullable=False,
            server_default="medium",
        ),
    )
    op.add_column(
        "galleries",
        sa.Column(
            "public_color_scheme",
            sa.String(length=16),
            nullable=False,
            server_default="light",
        ),
    )

    op.create_check_constraint(
        "ck_galleries_cover_focal_x_range",
        "galleries",
        "cover_focal_x >= 0 AND cover_focal_x <= 100",
    )
    op.create_check_constraint(
        "ck_galleries_cover_focal_y_range",
        "galleries",
        "cover_focal_y >= 0 AND cover_focal_y <= 100",
    )
    op.create_check_constraint(
        "ck_galleries_cover_display_option",
        "galleries",
        "cover_display_option IN ('centered_title', 'text_block', 'minimalist')",
    )
    op.create_check_constraint(
        "ck_galleries_public_photo_spacing",
        "galleries",
        "public_photo_spacing IN ('small', 'medium', 'large')",
    )
    op.create_check_constraint(
        "ck_galleries_public_color_scheme",
        "galleries",
        "public_color_scheme IN ('light', 'dark')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_galleries_public_color_scheme", "galleries", type_="check")
    op.drop_constraint("ck_galleries_public_photo_spacing", "galleries", type_="check")
    op.drop_constraint("ck_galleries_cover_display_option", "galleries", type_="check")
    op.drop_constraint("ck_galleries_cover_focal_y_range", "galleries", type_="check")
    op.drop_constraint("ck_galleries_cover_focal_x_range", "galleries", type_="check")

    op.drop_column("galleries", "cover_focal_x")
    op.drop_column("galleries", "cover_focal_y")
    op.drop_column("galleries", "cover_display_option")
    op.drop_column("galleries", "public_photo_spacing")
    op.drop_column("galleries", "public_color_scheme")
