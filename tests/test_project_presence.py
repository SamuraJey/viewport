from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from viewport.services.project_presence import ACTIVE_VIEWER_WINDOW_SECONDS, get_active_viewer_counts, record_project_presence
from viewport.services.redis_service import RedisService


def _redis_with_pipeline(results: list[int]) -> tuple[RedisService, MagicMock]:
    mock_client = AsyncMock()
    mock_pipeline = AsyncMock()
    mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
    mock_pipeline.__aexit__ = AsyncMock(return_value=None)
    mock_pipeline.zadd = MagicMock()
    mock_pipeline.zremrangebyscore = MagicMock()
    mock_pipeline.zcount = MagicMock()
    mock_pipeline.expire = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=results)
    mock_client.pipeline = MagicMock(return_value=mock_pipeline)
    return RedisService(mock_client, None, available=True), mock_pipeline


@pytest.mark.asyncio
async def test_record_project_presence_refreshes_unique_visitor_window():
    redis, pipeline = _redis_with_pipeline([1, 0, 1])
    project_id = uuid4()
    now = datetime(2026, 7, 23, 12, 0, tzinfo=UTC)

    await record_project_presence(
        redis,
        project_id,
        ip_address="203.0.113.4",
        user_agent="Viewport test browser",
        now=now,
    )

    key = f"project-active-viewers:{project_id}"
    pipeline.zadd.assert_called_once()
    assert pipeline.zadd.call_args.args[0] == key
    assert list(pipeline.zadd.call_args.args[1].values()) == [now.timestamp()]
    pipeline.zremrangebyscore.assert_called_once_with(
        key,
        0,
        now.timestamp() - ACTIVE_VIEWER_WINDOW_SECONDS,
    )
    pipeline.expire.assert_called_once_with(key, ACTIVE_VIEWER_WINDOW_SECONDS * 2)


@pytest.mark.asyncio
async def test_get_active_viewer_counts_batches_projects_and_degrades_to_zero():
    first_id = uuid4()
    second_id = uuid4()
    now = datetime(2026, 7, 23, 12, 0, tzinfo=UTC)
    redis, pipeline = _redis_with_pipeline([0, 3, 0, 1])

    counts = await get_active_viewer_counts(redis, [first_id, second_id], now=now)

    assert counts == {first_id: 3, second_id: 1}
    assert pipeline.zremrangebyscore.call_count == 2
    assert pipeline.zcount.call_count == 2

    unavailable = RedisService(None, None, available=False)
    assert await get_active_viewer_counts(unavailable, [first_id], now=now) == {}


@pytest.mark.asyncio
async def test_project_presence_degrades_when_redis_disconnects_after_startup():
    project_id = uuid4()
    now = datetime(2026, 7, 23, 12, 0, tzinfo=UTC)
    redis, pipeline = _redis_with_pipeline([])
    pipeline.execute.side_effect = RedisConnectionError("connection lost")

    await record_project_presence(
        redis,
        project_id,
        ip_address="203.0.113.4",
        user_agent="Viewport test browser",
        now=now,
    )
    assert await get_active_viewer_counts(redis, [project_id], now=now) == {}
