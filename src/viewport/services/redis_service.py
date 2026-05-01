"""Redis Service - Infrastructure layer for Redis operations.

This module provides a clean, reusable Redis client wrapper with:
- Connection pool management
- Graceful degradation when Redis is unavailable
- Async-first interface
- Proper lifecycle management for FastAPI
"""

import builtins
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


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

    async def execute(self) -> list[Any]:
        """Execute all queued commands."""
        result = await self.pipeline.execute()
        return list(result) if result else []


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
    ):
        """Initialize RedisService.

        Use RedisService.create() factory method instead of direct instantiation.
        """
        self._client = client
        self._pool = pool
        self._available = available

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

            return cls(client, pool, available=True)

        except RedisError as e:
            logger.warning("Redis unavailable, operating in degraded mode: %s", e)
            return cls(None, None, available=False)
        except Exception as e:
            logger.warning("Failed to connect to Redis, operating in degraded mode: %s", e)
            return cls(None, None, available=False)

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._available and self._client is not None

    async def close(self) -> None:
        """Close Redis connection and connection pool."""
        if self._client is not None:
            try:
                await self._client.aclose(close_connection_pool=True)
                logger.info("Redis client closed successfully")
            except Exception as e:
                logger.error("Error closing Redis client: %s", e)
            finally:
                self._client = None
                self._pool = None
                self._available = False

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
