from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from viewport.repositories.sharelink_repository import ShareLinkRepository


class _InsertResult:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount


@pytest.mark.asyncio
async def test_record_view_without_identity_does_not_increment_unique_views():
    db = AsyncMock()
    repo = ShareLinkRepository(db)
    repo._upsert_daily_stat = AsyncMock()

    sharelink_id = uuid4()
    await repo.record_view(sharelink_id, ip_address=None, user_agent=None)

    repo._upsert_daily_stat.assert_awaited_once()
    assert repo._upsert_daily_stat.await_args.kwargs["views_unique_inc"] == 0


@pytest.mark.asyncio
async def test_record_view_with_new_identity_increments_unique_views():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_InsertResult(1), None])
    repo = ShareLinkRepository(db)
    repo._upsert_daily_stat = AsyncMock()

    sharelink_id = uuid4()
    await repo.record_view(sharelink_id, ip_address="203.0.113.7", user_agent="pytest")

    repo._upsert_daily_stat.assert_awaited_once()
    assert repo._upsert_daily_stat.await_args.kwargs["views_unique_inc"] == 1
