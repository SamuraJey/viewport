from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import ConnectionPool, Redis

_redis_client_instance: Redis | None = None


class RedisSettings(BaseSettings):
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
    return RedisSettings()


def create_redis_client(settings: RedisSettings | None = None) -> Redis:
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


def set_redis_client_instance(client: Redis | None) -> None:
    global _redis_client_instance
    _redis_client_instance = client


def get_redis_client_instance() -> Redis | None:
    return _redis_client_instance
