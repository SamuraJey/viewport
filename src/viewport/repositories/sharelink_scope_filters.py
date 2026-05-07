import uuid
from typing import Any

from sqlalchemy import and_, or_

from viewport.models.gallery import Gallery
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink, ShareScopeType


def _sharelink_owner_filter(owner_id: uuid.UUID):
    """Match non-deleted gallery/project scoped share links owned by a user."""

    return or_(
        and_(
            ShareLink.scope_type == ShareScopeType.GALLERY.value,
            Gallery.owner_id == owner_id,
            Gallery.is_deleted.is_(False),
        ),
        and_(
            ShareLink.scope_type == ShareScopeType.PROJECT.value,
            Project.owner_id == owner_id,
            Project.is_deleted.is_(False),
        ),
    )


def scope_sharelinks_to_owner(stmt: Any, owner_id: uuid.UUID, *extra_filters: Any) -> Any:
    """Apply owner scoping and the required target joins for share-link queries."""

    return stmt.outerjoin(ShareLink.gallery).outerjoin(ShareLink.project).where(_sharelink_owner_filter(owner_id), *extra_filters)
