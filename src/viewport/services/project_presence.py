"""Transient active-viewer presence for project share links."""

import hashlib
import logging
import uuid
from datetime import UTC, datetime

from redis.exceptions import RedisError

from viewport.services.redis_service import RedisService

ACTIVE_VIEWER_WINDOW_SECONDS = 5 * 60
_KEY_PREFIX = "project-active-viewers"
logger = logging.getLogger(__name__)


def _presence_key(project_id: uuid.UUID) -> str:
    return f"{_KEY_PREFIX}:{project_id}"


def _visitor_id(ip_address: str | None, user_agent: str | None) -> str:
    raw = f"{ip_address or 'unknown'}\0{user_agent or 'unknown'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def record_project_presence(
    redis: RedisService | None,
    project_id: uuid.UUID,
    *,
    ip_address: str | None,
    user_agent: str | None,
    now: datetime | None = None,
) -> None:
    if redis is None or not redis.is_available:
        return

    try:
        timestamp = (now or datetime.now(UTC)).timestamp()
        key = _presence_key(project_id)
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zadd(key, {_visitor_id(ip_address, user_agent): timestamp})
            pipe.zremrangebyscore(key, 0, timestamp - ACTIVE_VIEWER_WINDOW_SECONDS)
            pipe.expire(key, ACTIVE_VIEWER_WINDOW_SECONDS * 2)
            await pipe.execute()
    except RedisError as exc:
        logger.warning("Could not record project presence: %s", exc)


async def get_active_viewer_counts(
    redis: RedisService | None,
    project_ids: list[uuid.UUID],
    *,
    now: datetime | None = None,
) -> dict[uuid.UUID, int]:
    if redis is None or not redis.is_available or not project_ids:
        return {}

    try:
        timestamp = (now or datetime.now(UTC)).timestamp()
        cutoff = timestamp - ACTIVE_VIEWER_WINDOW_SECONDS
        async with redis.pipeline(transaction=False) as pipe:
            for project_id in project_ids:
                key = _presence_key(project_id)
                pipe.zremrangebyscore(key, 0, cutoff)
                pipe.zcount(key, cutoff, timestamp)
            results = await pipe.execute()
    except RedisError as exc:
        logger.warning("Could not read project presence: %s", exc)
        return {}

    counts: dict[uuid.UUID, int] = {}
    for index, project_id in enumerate(project_ids):
        result_index = index * 2 + 1
        if result_index < len(results):
            counts[project_id] = int(results[result_index] or 0)
    return counts
