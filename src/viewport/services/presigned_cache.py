"""Presigned URL Cache Service.

Business logic for caching presigned S3 URLs in Redis.
Provides a clean interface for caching with automatic key generation,
batch operations, and cache invalidation by object key.
"""

import base64
import hashlib
import logging
from collections.abc import Iterable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from viewport.services.redis_service import RedisService

logger = logging.getLogger(__name__)

# Constants
PRESIGNED_CACHE_PREFIX = "presign"
PRESIGNED_CACHE_BUFFER_SECONDS = 600  # 10 minutes before actual expiry
PRESIGNED_INDEX_SUFFIX = "idx"


class PresignedUrlCacheService:
    """Service for caching presigned S3 URLs.

    This service handles:
    - Cache key generation (bucket + object_key + content-disposition hash)
    - TTL management with safety buffer
    - Batch get/set operations for performance
    - Index sets for efficient cache invalidation by object key

    Cache Key Structure:
        presign:{bucket}:{base64_object_key}:{disposition_hash}

    Index Key Structure (for invalidation):
        presign:{bucket}:{base64_object_key}:idx

    Example:
        cache_service = PresignedUrlCacheService(redis_service)

        # Single URL
        url = await cache_service.get_url(bucket, object_key, disposition)
        await cache_service.set_url(bucket, object_key, disposition, url, expires_in)

        # Batch operations
        urls = await cache_service.get_urls_batch(bucket, object_keys, disposition)
        await cache_service.set_urls_batch(bucket, key_url_pairs, expires_in)

        # Invalidation
        await cache_service.clear_urls_for_object_keys(bucket, object_keys)
    """

    def __init__(self, redis_service: "RedisService"):
        """Initialize with RedisService dependency."""
        self._redis = redis_service

    @property
    def is_available(self) -> bool:
        """Check if caching is available."""
        return self._redis.is_available

    # =========================================================================
    # Cache Key Generation
    # =========================================================================

    @staticmethod
    def _encode_object_key(object_key: str) -> str:
        """Encode object key to URL-safe base64 for use in cache keys."""
        encoded = base64.urlsafe_b64encode(object_key.encode("utf-8")).decode("ascii")
        return encoded.rstrip("=")

    @staticmethod
    def _disposition_hash(response_content_disposition: str | None) -> str:
        """Generate a hash for content disposition header."""
        if not response_content_disposition:
            return "none"
        return hashlib.sha256(response_content_disposition.encode("utf-8")).hexdigest()[:32]

    @staticmethod
    def _namespace_token(cache_namespace: str | None) -> str:
        """Build a stable cache namespace token for environment-specific isolation."""
        if not cache_namespace:
            return "default"
        return hashlib.sha256(cache_namespace.encode("utf-8")).hexdigest()[:16]

    def build_cache_key_prefix(
        self,
        bucket: str,
        object_key: str,
        cache_namespace: str | None = None,
    ) -> str:
        """Build the prefix for cache keys (without disposition hash)."""
        encoded_key = self._encode_object_key(object_key)
        namespace_token = self._namespace_token(cache_namespace)
        return f"{PRESIGNED_CACHE_PREFIX}:{bucket}:{namespace_token}:{encoded_key}"

    def build_cache_key(
        self,
        bucket: str,
        object_key: str,
        response_content_disposition: str | None = None,
        cache_namespace: str | None = None,
    ) -> str:
        """Build full cache key including disposition hash."""
        prefix = self.build_cache_key_prefix(bucket, object_key, cache_namespace)
        disposition = self._disposition_hash(response_content_disposition)
        return f"{prefix}:{disposition}"

    def build_index_key(
        self,
        bucket: str,
        object_key: str,
        cache_namespace: str | None = None,
    ) -> str:
        """Build index key for tracking all cache entries for an object."""
        return f"{self.build_cache_key_prefix(bucket, object_key, cache_namespace)}:{PRESIGNED_INDEX_SUFFIX}"

    @staticmethod
    def _index_key_from_cache_key(cache_key: str) -> str:
        """Extract index key from a full cache key."""
        prefix, _, _ = cache_key.rpartition(":")
        if not prefix:
            return f"{cache_key}:{PRESIGNED_INDEX_SUFFIX}"
        return f"{prefix}:{PRESIGNED_INDEX_SUFFIX}"

    @staticmethod
    def _effective_cache_ttl(expires_in: int) -> int:
        """Calculate effective TTL with safety buffer."""
        return max(1, expires_in - PRESIGNED_CACHE_BUFFER_SECONDS)

    # =========================================================================
    # Single URL Operations
    # =========================================================================

    async def get_url(
        self,
        bucket: str,
        object_key: str,
        response_content_disposition: str | None = None,
        cache_namespace: str | None = None,
    ) -> str | None:
        """Get cached presigned URL.

        Args:
            bucket: S3 bucket name
            object_key: S3 object key
            response_content_disposition: Optional content disposition header

        Returns:
            Cached URL or None if not found/unavailable.
        """
        cache_key = self.build_cache_key(bucket, object_key, response_content_disposition, cache_namespace)
        return await self.get_url_by_key(cache_key)

    async def get_url_by_key(self, cache_key: str) -> str | None:
        """Get cached presigned URL by pre-computed cache key."""
        try:
            return await self._redis.get(cache_key)
        except Exception as exc:
            logger.warning("Failed to read presigned URL cache for key %s: %s", cache_key, exc)
            return None

    async def set_url(
        self,
        bucket: str,
        object_key: str,
        response_content_disposition: str | None,
        url: str,
        expires_in: int,
        cache_namespace: str | None = None,
    ) -> None:
        """Cache a presigned URL.

        Args:
            bucket: S3 bucket name
            object_key: S3 object key
            response_content_disposition: Optional content disposition header
            url: The presigned URL to cache
            expires_in: URL expiration time in seconds
        """
        cache_key = self.build_cache_key(bucket, object_key, response_content_disposition, cache_namespace)
        await self.set_url_by_key(cache_key, url, expires_in)

    async def set_url_by_key(self, cache_key: str, url: str, expires_in: int) -> None:
        """Cache a presigned URL using pre-computed cache key."""
        if not self._redis.is_available:
            return

        ttl = self._effective_cache_ttl(expires_in)
        index_key = self._index_key_from_cache_key(cache_key)

        try:
            async with self._redis.pipeline() as pipe:
                pipe.set(cache_key, url, ex=ttl)
                pipe.sadd(index_key, cache_key)
                pipe.expire(index_key, ttl)
                await pipe.execute()
        except Exception as exc:
            logger.warning("Failed to cache presigned URL for key %s: %s", cache_key, exc)

    # =========================================================================
    # Batch Operations
    # =========================================================================

    async def get_urls_batch(
        self,
        bucket: str,
        object_keys: list[str],
        response_content_disposition: str | None = None,
        cache_namespace: str | None = None,
    ) -> dict[str, str]:
        """Get multiple cached presigned URLs.

        Args:
            bucket: S3 bucket name
            object_keys: List of S3 object keys
            response_content_disposition: Optional content disposition (same for all)

        Returns:
            Dictionary mapping object_key to cached URL (only includes found keys).
        """
        if not object_keys:
            return {}

        cache_keys = [self.build_cache_key(bucket, key, response_content_disposition, cache_namespace) for key in object_keys]
        cached = await self.get_urls_batch_by_keys(cache_keys)

        # Map cache keys back to object keys
        result: dict[str, str] = {}
        for object_key, cache_key in zip(object_keys, cache_keys, strict=False):
            if cache_key in cached:
                result[object_key] = cached[cache_key]
        return result

    async def get_urls_batch_by_keys(self, cache_keys: list[str]) -> dict[str, str]:
        """Get multiple cached presigned URLs by pre-computed cache keys."""
        if not cache_keys:
            return {}
        try:
            return await self._redis.mget(cache_keys)
        except Exception as exc:
            logger.warning("Failed to read presigned URL batch cache: %s", exc)
            return {}

    async def set_urls_batch(
        self,
        key_url_pairs: list[tuple[str, str]],
        expires_in: int,
    ) -> None:
        """Cache multiple presigned URLs.

        Args:
            key_url_pairs: List of (cache_key, url) tuples
            expires_in: URL expiration time in seconds
        """
        if not self._redis.is_available or not key_url_pairs:
            return

        ttl = self._effective_cache_ttl(expires_in)

        try:
            async with self._redis.pipeline() as pipe:
                for cache_key, url in key_url_pairs:
                    pipe.set(cache_key, url, ex=ttl)
                    index_key = self._index_key_from_cache_key(cache_key)
                    pipe.sadd(index_key, cache_key)
                    pipe.expire(index_key, ttl)
                await pipe.execute()
        except Exception as exc:
            logger.warning("Failed to write presigned URL batch cache: %s", exc)

    # =========================================================================
    # Cache Invalidation
    # =========================================================================

    async def clear_url(self, cache_key: str) -> None:
        """Clear a single cached URL."""
        if not self._redis.is_available:
            return

        index_key = self._index_key_from_cache_key(cache_key)

        try:
            async with self._redis.pipeline() as pipe:
                pipe.delete(cache_key)
                pipe.srem(index_key, cache_key)
                await pipe.execute()
        except Exception as exc:
            logger.warning("Failed to clear cached URL for key %s: %s", cache_key, exc)

    async def clear_urls_batch(self, cache_keys: list[str]) -> None:
        """Clear multiple cached URLs."""
        if not self._redis.is_available or not cache_keys:
            return

        try:
            async with self._redis.pipeline() as pipe:
                pipe.delete(*cache_keys)
                for cache_key in cache_keys:
                    pipe.srem(self._index_key_from_cache_key(cache_key), cache_key)
                await pipe.execute()
        except Exception as exc:
            logger.warning("Failed to clear cached URLs batch: %s", exc)

    async def clear_urls_for_object_keys(
        self,
        bucket: str,
        object_keys: Iterable[str],
        cache_namespace: str | None = None,
    ) -> None:
        """Clear all cached URLs for given object keys (any content disposition).

        This uses the index sets to find all cache entries for each object key,
        regardless of content disposition, and deletes them all.

        Args:
            bucket: S3 bucket name
            object_keys: Object keys to invalidate cache for
        """
        if not self._redis.is_available:
            return

        deduplicated = {key for key in object_keys if key}
        if not deduplicated:
            return

        index_keys = [self.build_index_key(bucket, key, cache_namespace) for key in deduplicated]

        try:
            # Get all cache keys from index sets
            cached_members = await self._redis.sunion(*index_keys)

            # Collect all keys to delete (index keys + actual cache keys)
            keys_to_delete: set[str] = set(index_keys)
            keys_to_delete.update(cached_members)

            if keys_to_delete:
                await self._redis.delete(*list(keys_to_delete))

        except Exception as exc:
            logger.warning("Failed to clear presigned URL cache for object keys: %s", exc)


# Module-level instance for singleton access
_presigned_cache_service: PresignedUrlCacheService | None = None


def set_presigned_cache_service(service: PresignedUrlCacheService | None) -> None:
    """Set the global PresignedUrlCacheService instance (called during lifespan)."""
    global _presigned_cache_service
    _presigned_cache_service = service


def get_presigned_cache_service() -> PresignedUrlCacheService | None:
    """Get the global PresignedUrlCacheService instance."""
    return _presigned_cache_service
