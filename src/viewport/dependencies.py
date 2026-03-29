"""
Dependency Injection

This module provides FastAPI dependency injection for shared services:
- AsyncS3Client: S3 storage operations
- RedisService: Redis caching infrastructure
- PresignedUrlCacheService: Presigned URL caching business logic

All services are initialized during application startup via the lifespan context manager.
"""

import logging
from collections.abc import AsyncGenerator

from viewport.s3_service import AsyncS3Client
from viewport.services.presigned_cache import PresignedUrlCacheService, get_presigned_cache_service
from viewport.services.redis_service import RedisService, get_redis_service

logger = logging.getLogger(__name__)

# Global instance of the S3 client (initialized during app startup)
_s3_client_instance: AsyncS3Client | None = None


async def get_s3_client() -> AsyncGenerator[AsyncS3Client]:
    """Dependency injection function for AsyncS3Client.

    This function is used with FastAPI's Depends() to inject the S3 client
    into route handlers. The client is initialized once during application
    startup via the lifespan context manager.

    Yields:
        AsyncS3Client instance

    Example:
        @app.post("/upload/")
        async def upload(file: UploadFile, s3: AsyncS3Client = Depends(get_s3_client)):
            await s3.upload_fileobj(file.file, f"uploads/{file.filename}")
            return {"status": "ok"}
    """
    global _s3_client_instance
    if _s3_client_instance is None:
        raise RuntimeError("S3 client not initialized. Make sure the application lifespan is properly configured.")
    yield _s3_client_instance


def set_s3_client_instance(client: AsyncS3Client) -> None:
    """Set the global S3 client instance.

    This is called during application startup via the lifespan context manager.

    Args:
        client: The AsyncS3Client instance to use
    """
    global _s3_client_instance
    _s3_client_instance = client
    logger.info("S3 client instance set globally")


def get_s3_client_instance() -> AsyncS3Client:
    """Get the global S3 client instance without using dependency injection.

    This should be used internally by the application, not in route handlers.

    Returns:
        AsyncS3Client instance

    Raises:
        RuntimeError: If the client is not initialized
    """
    global _s3_client_instance
    if _s3_client_instance is None:
        raise RuntimeError("S3 client not initialized. Make sure the application lifespan is properly configured.")
    return _s3_client_instance


async def get_redis() -> AsyncGenerator[RedisService | None]:
    """Dependency injection function for RedisService.

    Yields:
        RedisService instance if available, otherwise None.

    Example:
        @app.get("/cache-status")
        async def cache_status(redis: RedisService | None = Depends(get_redis)):
            return {"available": redis.is_available if redis else False}
    """
    yield get_redis_service()


async def get_presigned_cache() -> AsyncGenerator[PresignedUrlCacheService | None]:
    """Dependency injection function for PresignedUrlCacheService.

    Yields:
        PresignedUrlCacheService instance if available, otherwise None.

    Example:
        @app.get("/photos/{photo_id}/url")
        async def get_photo_url(
            photo_id: int,
            cache: PresignedUrlCacheService | None = Depends(get_presigned_cache)
        ):
            # Use cache service for presigned URL operations
            ...
    """
    yield get_presigned_cache_service()
