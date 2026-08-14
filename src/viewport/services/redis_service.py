"""Redis Service - Infrastructure layer for Redis operations.

This module provides a clean, reusable Redis client wrapper with:
- Connection pool management
- Graceful degradation when Redis is unavailable
- Async-first interface
- Proper lifecycle management for FastAPI
"""

import asyncio
import builtins
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


FIXED_WINDOW_INCREMENT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return {count, ttl}
"""


class RedisSettings(BaseSettings):
    """Redis connection settings loaded from environment."""

    redis_url: str = "redis://localhost:6379/1"
    redis_max_connections: int = 20
    redis_socket_connect_timeout: float = 1.0
    redis_socket_timeout: float = 1.0
    redis_retry_on_timeout: bool = True
    redis_decode_responses: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    """Get cached Redis settings instance."""
    return RedisSettings()


@dataclass
class PipelineContext:
    """Context for batching Redis commands in a pipeline."""

    pipeline: Any  # redis.asyncio.client.Pipeline
    service: "RedisService"

    def set(self, key: str, value: str, ex: int | None = None) -> "PipelineContext":
        """Queue a SET command."""
        self.pipeline.set(key, value, ex=ex)
        return self

    def get(self, key: str) -> "PipelineContext":
        """Queue a GET command."""
        self.pipeline.get(key)
        return self

    def delete(self, *keys: str) -> "PipelineContext":
        """Queue a DELETE command."""
        self.pipeline.delete(*keys)
        return self

    def sadd(self, key: str, *members: str) -> "PipelineContext":
        """Queue a SADD command."""
        self.pipeline.sadd(key, *members)
        return self

    def srem(self, key: str, *members: str) -> "PipelineContext":
        """Queue a SREM command."""
        self.pipeline.srem(key, *members)
        return self

    def expire(self, key: str, seconds: int) -> "PipelineContext":
        """Queue an EXPIRE command."""
        self.pipeline.expire(key, seconds)
        return self

    def zadd(self, key: str, mapping: dict[str, float]) -> "PipelineContext":
        """Queue a ZADD command."""
        self.pipeline.zadd(key, mapping)
        return self

    def zremrangebyscore(self, key: str, minimum: float, maximum: float) -> "PipelineContext":
        """Queue a ZREMRANGEBYSCORE command."""
        self.pipeline.zremrangebyscore(key, minimum, maximum)
        return self

    def zcount(self, key: str, minimum: float, maximum: float) -> "PipelineContext":
        """Queue a ZCOUNT command."""
        self.pipeline.zcount(key, minimum, maximum)
        return self

    async def execute(self) -> list[Any]:
        """Execute all queued commands."""
        result = await self.pipeline.execute()
        return list(result) if result else []


@dataclass(frozen=True)
class FixedWindowIncrement:
    """Result of an atomic fixed-window counter increment."""

    count: int
    retry_after: int


class RedisService:
    """Redis service with graceful degradation and clean interface.

    This service wraps the Redis client providing:
    - Connection pool management
    - Automatic graceful degradation when Redis is unavailable
    - Clean async interface for common operations
    - Pipeline support for batch operations

    Example:
        # In FastAPI lifespan
        redis_service = await RedisService.create()

        # In route handlers
        value = await redis_service.get("key")
        await redis_service.set("key", "value", ex=3600)

        # Batch operations
        async with redis_service.pipeline() as pipe:
            pipe.set("key1", "value1", ex=3600)
            pipe.set("key2", "value2", ex=3600)
            results = await pipe.execute()
    """

    def __init__(
        self,
        client: Redis | None,
        pool: ConnectionPool | None,
        *,
        available: bool = True,
        settings: RedisSettings | None = None,
    ):
        """Initialize RedisService.

        Use RedisService.create() factory method instead of direct instantiation.
        """
        self._client = client
        self._pool = pool
        self._available = available
        self._settings = settings
        self._reconnect_lock = asyncio.Lock()
        self._next_reconnect_at = 0.0

    @classmethod
    async def create(cls, settings: RedisSettings | None = None) -> "RedisService":
        """Factory method to create and connect RedisService.

        Args:
            settings: Optional Redis settings. Uses environment settings if not provided.

        Returns:
            Configured RedisService instance. If Redis is unavailable,
            returns a degraded instance that returns None for all operations.
        """
        resolved_settings = settings or get_redis_settings()
        client: Redis | None = None

        try:
            pool = ConnectionPool.from_url(
                resolved_settings.redis_url,
                decode_responses=resolved_settings.redis_decode_responses,
                max_connections=resolved_settings.redis_max_connections,
                socket_connect_timeout=resolved_settings.redis_socket_connect_timeout,
                socket_timeout=resolved_settings.redis_socket_timeout,
                retry_on_timeout=resolved_settings.redis_retry_on_timeout,
            )
            client = Redis(connection_pool=pool)

            # Test connection
            await client.ping()  # type: ignore[misc]
            logger.info("Redis connection established successfully")

            return cls(client, pool, available=True, settings=resolved_settings)

        except RedisError as e:
            logger.warning("Redis unavailable, operating in degraded mode: %s", e)
            if client is not None:
                try:
                    await client.aclose(close_connection_pool=True)
                except Exception as close_error:
                    logger.debug("Failed to close unavailable Redis client: %s", close_error)
            return cls(None, None, available=False, settings=resolved_settings)
        except Exception as e:
            logger.warning("Failed to connect to Redis, operating in degraded mode: %s", e)
            if client is not None:
                try:
                    await client.aclose(close_connection_pool=True)
                except Exception as close_error:
                    logger.debug("Failed to close unavailable Redis client: %s", close_error)
            return cls(None, None, available=False, settings=resolved_settings)

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._available and self._client is not None

    async def close(self) -> None:
        """Close Redis connection and connection pool."""
        try:
            if self._client is None:
                return
            try:
                await self._client.aclose(close_connection_pool=True)
                logger.info("Redis client closed successfully")
            except Exception as e:
                logger.error("Error closing Redis client: %s", e)
        finally:
            self._client = None
            self._pool = None
            self._available = False
            self._settings = None

    async def ping(self) -> bool:
        """Ping Redis to check connection."""
        if not self.is_available:
            return False
        try:
            await self._client.ping()  # type: ignore[union-attr, misc]
            return True
        except RedisError:
            return False

    async def get(self, key: str) -> str | None:
        """Get a value from Redis.

        Returns None if Redis is unavailable or key doesn't exist.
        """
        if not self.is_available:
            return None
        try:
            value = await self._client.get(key)  # type: ignore[union-attr]
            return self._coerce_text(value)
        except RedisError as e:
            logger.warning("Redis GET failed for key %s: %s", key, e)
            return None

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
    ) -> bool:
        """Set a value in Redis.

        Args:
            key: The key to set
            value: The value to store
            ex: Optional expiration time in seconds

        Returns:
            True if successful, False if Redis unavailable or operation failed.
        """
        if not self.is_available:
            return False
        try:
            await self._client.set(key, value, ex=ex)  # type: ignore[union-attr]
            return True
        except RedisError as e:
            logger.warning("Redis SET failed for key %s: %s", key, e)
            return False

    async def mget(self, keys: list[str]) -> dict[str, str]:
        """Get multiple values from Redis.

        Args:
            keys: List of keys to retrieve

        Returns:
            Dictionary mapping keys to values (only includes keys that exist).
        """
        if not self.is_available or not keys:
            return {}
        try:
            values = await self._client.mget(keys)  # type: ignore[union-attr]
            result: dict[str, str] = {}
            for key, value in zip(keys, values, strict=False):
                decoded = self._coerce_text(value)
                if decoded is not None:
                    result[key] = decoded
            return result
        except RedisError as e:
            logger.warning("Redis MGET failed: %s", e)
            return {}

    async def delete(self, *keys: str) -> int:
        """Delete one or more keys from Redis.

        Returns:
            Number of keys deleted, 0 if Redis unavailable.
        """
        if not self.is_available or not keys:
            return 0
        try:
            result = await self._client.delete(*keys)  # type: ignore[union-attr]
            return int(result)
        except RedisError as e:
            logger.warning("Redis DELETE failed: %s", e)
            return 0

    async def fixed_window_increment(self, key: str, window_seconds: int) -> FixedWindowIncrement | None:
        """Atomically increment a counter and return its remaining window.

        ``None`` means Redis was unavailable or the operation failed. Callers
        must choose an explicit degradation policy instead of treating that as
        a zero count.
        """
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        if not self.is_available:
            await self._reconnect_if_due()
        if not self.is_available:
            return None

        try:
            result = await self._client.eval(  # type: ignore[union-attr, misc]
                FIXED_WINDOW_INCREMENT_SCRIPT,
                1,
                key,
                window_seconds,
            )
            if not isinstance(result, (list, tuple)) or len(result) != 2:
                logger.warning("Redis fixed-window script returned an invalid result for key %s", key)
                return None
            return FixedWindowIncrement(count=int(result[0]), retry_after=max(int(result[1]), 1))
        except (RedisError, TypeError, ValueError) as e:
            logger.warning("Redis fixed-window increment failed for key %s: %s", key, e)
            self._available = False
            self._next_reconnect_at = time.monotonic() + 5.0
            return None

    async def _reconnect_if_due(self) -> None:
        """Retry a failed startup/connection so fallback is not permanent."""
        settings = self._settings
        if settings is None or time.monotonic() < self._next_reconnect_at:
            return

        async with self._reconnect_lock:
            if self.is_available or self._settings is None or time.monotonic() < self._next_reconnect_at:
                return
            replacement = await type(self).create(self._settings)
            if not replacement.is_available:
                self._next_reconnect_at = time.monotonic() + 5.0
                return

            old_client = self._client
            self._client = replacement._client
            self._pool = replacement._pool
            self._available = True
            self._next_reconnect_at = 0.0
            replacement._client = None
            replacement._pool = None
            replacement._available = False
            if old_client is not None:
                try:
                    await old_client.aclose(close_connection_pool=True)
                except Exception as exc:
                    logger.debug("Failed to close stale Redis client during reconnect: %s", exc)
            logger.info("Redis connection restored after degraded startup/runtime state")

    async def sadd(self, key: str, *members: str) -> int:
        """Add members to a set.

        Returns:
            Number of members added, 0 if Redis unavailable.
        """
        if not self.is_available or not members:
            return 0
        try:
            result = await self._client.sadd(key, *members)  # type: ignore[union-attr, misc]
            return int(result)
        except RedisError as e:
            logger.warning("Redis SADD failed for key %s: %s", key, e)
            return 0

    async def sunion(self, *keys: str) -> builtins.set[str]:
        """Get union of multiple sets.

        Returns:
            Set of all members, empty set if Redis unavailable.
        """
        if not self.is_available or not keys:
            return builtins.set()
        try:
            result = await self._client.sunion(list(keys))  # type: ignore[union-attr, misc]
            coerced: builtins.set[str] = builtins.set()
            for m in result:
                text = self._coerce_text(m)
                if text is not None:
                    coerced.add(text)
            return coerced
        except RedisError as e:
            logger.warning("Redis SUNION failed: %s", e)
            return builtins.set()

    @asynccontextmanager
    async def pipeline(self, transaction: bool = False) -> AsyncIterator[PipelineContext | _NoOpPipelineContext]:
        """Create a pipeline for batching commands.

        Args:
            transaction: If True, execute commands atomically (MULTI/EXEC)

        Yields:
            PipelineContext for queuing commands

        Example:
            async with redis_service.pipeline() as pipe:
                pipe.set("key1", "value1", ex=3600)
                pipe.set("key2", "value2", ex=3600)
                results = await pipe.execute()
        """
        if not self.is_available:
            # Return a no-op pipeline that silently does nothing
            yield _NoOpPipelineContext()
            return

        async with self._client.pipeline(transaction=transaction) as pipe:  # type: ignore[union-attr]
            yield PipelineContext(pipe, self)

    @staticmethod
    def _coerce_text(value: Any) -> str | None:
        """Convert Redis value to string."""
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("utf-8")
        if isinstance(value, str):
            return value
        return str(value)


class _NoOpPipelineContext:
    """No-op pipeline for graceful degradation."""

    def set(self, key: str, value: str, ex: int | None = None) -> "_NoOpPipelineContext":
        return self

    def get(self, key: str) -> "_NoOpPipelineContext":
        return self

    def delete(self, *keys: str) -> "_NoOpPipelineContext":
        return self

    def sadd(self, key: str, *members: str) -> "_NoOpPipelineContext":
        return self

    def srem(self, key: str, *members: str) -> "_NoOpPipelineContext":
        return self

    def expire(self, key: str, seconds: int) -> "_NoOpPipelineContext":
        return self

    def zadd(self, key: str, mapping: dict[str, float]) -> "_NoOpPipelineContext":
        return self

    def zremrangebyscore(self, key: str, minimum: float, maximum: float) -> "_NoOpPipelineContext":
        return self

    def zcount(self, key: str, minimum: float, maximum: float) -> "_NoOpPipelineContext":
        return self

    async def execute(self) -> list[Any]:
        return []


# Module-level instance for singleton access
_redis_service_instance: RedisService | None = None


def set_redis_service(service: RedisService | None) -> None:
    """Set the global RedisService instance (called during lifespan)."""
    global _redis_service_instance
    _redis_service_instance = service


def get_redis_service() -> RedisService | None:
    """Get the global RedisService instance."""
    return _redis_service_instance
