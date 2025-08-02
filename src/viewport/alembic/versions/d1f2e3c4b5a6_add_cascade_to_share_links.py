"""add cascade delete to share_links_fk

Revision ID: d1f2e3c4b5a6
Revises: 87fdf2f6eb17
Create Date: 2025-08-02 12:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd1f2e3c4b5a6'
down_revision = '87fdf2f6eb17'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # drop existing foreign key without cascade
    op.drop_constraint('share_links_gallery_id_fkey', 'share_links', type_='foreignkey')
    # recreate with ON DELETE CASCADE
    op.create_foreign_key(
        'share_links_gallery_id_fkey',
        'share_links',
        'galleries',
        ['gallery_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # drop FK with cascade
    op.drop_constraint('share_links_gallery_id_fkey', 'share_links', type_='foreignkey')
    # recreate original FK without cascade
    op.create_foreign_key(
        'share_links_gallery_id_fkey',
        'share_links',
        'galleries',
        ['gallery_id'],
        ['id']
    )
