"""Redis client module - DEPRECATED.

This module is deprecated. Use viewport.services.redis_service instead.

Provides backward compatibility shim for existing imports.
"""

import warnings
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import ConnectionPool, Redis

warnings.warn(
    "viewport.redis_client is deprecated. Use viewport.services.redis_service instead.",
    DeprecationWarning,
    stacklevel=2,
)


# Re-export for backward compatibility
class RedisSettings(BaseSettings):
    """Redis connection settings loaded from environment.

    DEPRECATED: Use viewport.services.redis_service.RedisSettings instead.
    """

    redis_url: str = "redis://localhost:6379/1"
    max_connections: int = 20
    redis_socket_connect_timeout: float = 1.0
    redis_socket_timeout: float = 1.0
    redis_retry_on_timeout: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    """Get cached Redis settings instance.

    DEPRECATED: Use viewport.services.redis_service.get_redis_settings instead.
    """
    return RedisSettings()


def create_redis_client(settings: RedisSettings | None = None) -> Redis:
    """Create Redis client.

    DEPRECATED: Use viewport.services.redis_service.RedisService.create instead.
    """
    resolved_settings = settings or get_redis_settings()
    pool = ConnectionPool.from_url(
        resolved_settings.redis_url,
        decode_responses=True,
        max_connections=resolved_settings.max_connections,
        socket_connect_timeout=resolved_settings.redis_socket_connect_timeout,
        socket_timeout=resolved_settings.redis_socket_timeout,
        retry_on_timeout=resolved_settings.redis_retry_on_timeout,
    )
    return Redis(connection_pool=pool)


# These functions are removed - import from services instead
_redis_client_instance: Redis | None = None


def set_redis_client_instance(client: Redis | None) -> None:
    """DEPRECATED: Use viewport.services.redis_service.set_redis_service instead."""
    global _redis_client_instance
    _redis_client_instance = client


def get_redis_client_instance() -> Redis | None:
    """DEPRECATED: Use viewport.services.redis_service.get_redis_service instead."""
    return _redis_client_instance
