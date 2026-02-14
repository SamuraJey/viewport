"""add storage quota to users

Revision ID: 5b3f2a1c9d0e
Revises: 85fe4b397142
Create Date: 2026-02-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5b3f2a1c9d0e"
down_revision: Union[str, Sequence[str], None] = "85fe4b397142"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "storage_quota",
            sa.BigInteger(),
            nullable=False,
            server_default=str(DEFAULT_STORAGE_QUOTA_BYTES),
        ),
    )
    op.add_column(
        "users",
        sa.Column("storage_used", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("storage_reserved", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "users_storage_quota_nonnegative",
        "users",
        "storage_quota >= 0",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("users_storage_quota_nonnegative", "users", type_="check")
    op.drop_column("users", "storage_reserved")
    op.drop_column("users", "storage_used")
    op.drop_column("users", "storage_quota")
