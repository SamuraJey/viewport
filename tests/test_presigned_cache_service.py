"""
Tests for PresignedUrlCacheService.

Tests cover cache key generation, single and batch operations, and cache invalidation.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from viewport.services.presigned_cache import PRESIGNED_CACHE_BUFFER_SECONDS, PRESIGNED_CACHE_PREFIX, PRESIGNED_INDEX_SUFFIX, PresignedUrlCacheService


class MockRedisService:
    """Mock RedisService for testing."""

    def __init__(self, available: bool = True):
        self._available = available
        self.get = AsyncMock(return_value=None)
        self.set = AsyncMock(return_value=True)
        self.mget = AsyncMock(return_value={})
        self.delete = AsyncMock(return_value=0)
        self.sunion = AsyncMock(return_value=set())
        self._pipeline_context = MagicMock()
        self._pipeline_context.set = MagicMock(return_value=self._pipeline_context)
        self._pipeline_context.sadd = MagicMock(return_value=self._pipeline_context)
        self._pipeline_context.srem = MagicMock(return_value=self._pipeline_context)
        self._pipeline_context.expire = MagicMock(return_value=self._pipeline_context)
        self._pipeline_context.delete = MagicMock(return_value=self._pipeline_context)
        self._pipeline_context.execute = AsyncMock(return_value=[])

    @property
    def is_available(self) -> bool:
        return self._available

    def pipeline(self, transaction: bool = False):
        """Return async context manager for pipeline."""
        return MockPipelineContext(self._pipeline_context)


class MockPipelineContext:
    """Mock async context manager for pipeline."""

    def __init__(self, pipeline_context):
        self._context = pipeline_context

    async def __aenter__(self):
        return self._context

    async def __aexit__(self, *args):
        pass


class TestCacheKeyGeneration:
    """Tests for cache key generation methods."""

    def test_encode_object_key(self):
        """Test object key encoding to URL-safe base64."""
        result = PresignedUrlCacheService._encode_object_key("galleries/123/photos/abc.jpg")
        # Should be URL-safe base64 without padding
        assert "=" not in result
        assert "/" not in result or result == result.replace("/", "_")

    def test_disposition_hash_with_none(self):
        """Test disposition hash returns 'none' for None input."""
        result = PresignedUrlCacheService._disposition_hash(None)
        assert result == "none"

    def test_disposition_hash_with_value(self):
        """Test disposition hash returns truncated SHA256."""
        result = PresignedUrlCacheService._disposition_hash('attachment; filename="test.jpg"')
        assert len(result) == 32  # Truncated to 32 chars

    def test_build_cache_key_prefix(self):
        """Test cache key prefix generation."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = service.build_cache_key_prefix("my-bucket", "photos/test.jpg")

        assert result.startswith(PRESIGNED_CACHE_PREFIX + ":")
        assert "my-bucket" in result

    def test_build_cache_key(self):
        """Test full cache key generation."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = service.build_cache_key("bucket", "key.jpg", "attachment")

        # Should have format: presign:bucket:encoded_key:disposition_hash
        parts = result.split(":")
        assert len(parts) == 4
        assert parts[0] == PRESIGNED_CACHE_PREFIX

    def test_build_index_key(self):
        """Test index key generation."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = service.build_index_key("bucket", "photos/test.jpg")

        assert result.endswith(f":{PRESIGNED_INDEX_SUFFIX}")

    def test_index_key_from_cache_key(self):
        """Test extracting index key from cache key."""
        cache_key = "presign:bucket:encoded_key:disposition_hash"
        result = PresignedUrlCacheService._index_key_from_cache_key(cache_key)
        assert result == "presign:bucket:encoded_key:idx"

    def test_index_key_from_cache_key_no_prefix(self):
        """Test index key extraction when no colons present."""
        result = PresignedUrlCacheService._index_key_from_cache_key("simplekey")
        assert result == "simplekey:idx"

    def test_effective_cache_ttl(self):
        """Test TTL calculation with buffer."""
        result = PresignedUrlCacheService._effective_cache_ttl(3600)
        assert result == 3600 - PRESIGNED_CACHE_BUFFER_SECONDS

    def test_effective_cache_ttl_minimum_one(self):
        """Test TTL never goes below 1."""
        result = PresignedUrlCacheService._effective_cache_ttl(100)
        assert result == 1


class TestSingleUrlOperations:
    """Tests for single URL cache operations."""

    @pytest.mark.asyncio
    async def test_get_url_returns_none_when_unavailable(self):
        """Test get_url returns None when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_url("bucket", "key.jpg")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_url_returns_cached_value(self):
        """Test get_url returns cached URL."""
        mock_redis = MockRedisService()
        mock_redis.get = AsyncMock(return_value="https://cached.example.com")
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_url("bucket", "key.jpg")

        assert result == "https://cached.example.com"

    @pytest.mark.asyncio
    async def test_get_url_by_key(self):
        """Test get_url_by_key with pre-computed cache key."""
        mock_redis = MockRedisService()
        mock_redis.get = AsyncMock(return_value="https://cached.example.com")
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_url_by_key("cache_key")

        assert result == "https://cached.example.com"
        mock_redis.get.assert_called_once_with("cache_key")

    @pytest.mark.asyncio
    async def test_get_url_by_key_handles_exception(self):
        """Test get_url_by_key returns None on exception."""
        mock_redis = MockRedisService()
        mock_redis.get = AsyncMock(side_effect=Exception("Redis error"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_url_by_key("cache_key")

        assert result is None

    @pytest.mark.asyncio
    async def test_set_url_when_unavailable(self):
        """Test set_url does nothing when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.set_url("bucket", "key.jpg", None, "https://url.com", 3600)

    @pytest.mark.asyncio
    async def test_set_url_by_key_handles_exception(self):
        """Test set_url_by_key handles pipeline exception."""
        mock_redis = MockRedisService()
        mock_redis._pipeline_context.execute = AsyncMock(side_effect=Exception("Pipeline failed"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.set_url_by_key("cache_key", "https://url.com", 3600)


class TestBatchOperations:
    """Tests for batch URL cache operations."""

    @pytest.mark.asyncio
    async def test_get_urls_batch_empty_keys(self):
        """Test get_urls_batch returns empty dict for empty keys."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_urls_batch("bucket", [])

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_urls_batch_maps_keys_correctly(self):
        """Test get_urls_batch maps cache keys back to object keys."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Build proper cache keys for the test
        obj_key1 = "key1.jpg"
        obj_key2 = "key2.jpg"
        cache_key1 = service.build_cache_key("bucket", obj_key1, None)
        cache_key2 = service.build_cache_key("bucket", obj_key2, None)

        # Simulate cache returning URLs for these keys
        mock_redis.mget = AsyncMock(return_value={cache_key1: "url1", cache_key2: "url2"})

        result = await service.get_urls_batch("bucket", [obj_key1, obj_key2])

        # Should map back to object keys
        assert obj_key1 in result
        assert obj_key2 in result
        assert result[obj_key1] == "url1"
        assert result[obj_key2] == "url2"

    @pytest.mark.asyncio
    async def test_get_urls_batch_by_keys_returns_found(self):
        """Test get_urls_batch_by_keys returns only found keys."""
        mock_redis = MockRedisService()
        mock_redis.mget = AsyncMock(return_value={"key1": "url1", "key3": "url3"})
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_urls_batch_by_keys(["key1", "key2", "key3"])

        assert result == {"key1": "url1", "key3": "url3"}

    @pytest.mark.asyncio
    async def test_get_urls_batch_by_keys_empty_keys(self):
        """Test get_urls_batch_by_keys returns empty dict for empty keys."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_urls_batch_by_keys([])

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_urls_batch_by_keys_handles_exception(self):
        """Test get_urls_batch_by_keys returns empty dict on exception."""
        mock_redis = MockRedisService()
        mock_redis.mget = AsyncMock(side_effect=Exception("Redis error"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        result = await service.get_urls_batch_by_keys(["key1", "key2"])

        assert result == {}

    @pytest.mark.asyncio
    async def test_set_urls_batch_when_unavailable(self):
        """Test set_urls_batch does nothing when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.set_urls_batch([("key", "url")], 3600)

    @pytest.mark.asyncio
    async def test_set_urls_batch_empty_pairs(self):
        """Test set_urls_batch does nothing for empty pairs."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise and not call pipeline
        await service.set_urls_batch([], 3600)

    @pytest.mark.asyncio
    async def test_set_urls_batch_handles_exception(self):
        """Test set_urls_batch handles pipeline exception."""
        mock_redis = MockRedisService()
        mock_redis._pipeline_context.execute = AsyncMock(side_effect=Exception("Pipeline failed"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.set_urls_batch([("key1", "url1"), ("key2", "url2")], 3600)


class TestCacheInvalidation:
    """Tests for cache invalidation operations."""

    @pytest.mark.asyncio
    async def test_clear_url_when_unavailable(self):
        """Test clear_url does nothing when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_url("cache_key")

    @pytest.mark.asyncio
    async def test_clear_url_handles_exception(self):
        """Test clear_url handles pipeline exception."""
        mock_redis = MockRedisService()
        mock_redis._pipeline_context.execute = AsyncMock(side_effect=Exception("Pipeline failed"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_url("cache_key")

    @pytest.mark.asyncio
    async def test_clear_urls_batch_when_unavailable(self):
        """Test clear_urls_batch does nothing when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_urls_batch(["key1", "key2"])

    @pytest.mark.asyncio
    async def test_clear_urls_batch_empty_keys(self):
        """Test clear_urls_batch does nothing for empty keys."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_urls_batch([])

    @pytest.mark.asyncio
    async def test_clear_urls_batch_handles_exception(self):
        """Test clear_urls_batch handles pipeline exception."""
        mock_redis = MockRedisService()
        mock_redis._pipeline_context.execute = AsyncMock(side_effect=Exception("Pipeline failed"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_urls_batch(["key1", "key2"])

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_when_unavailable(self):
        """Test clear_urls_for_object_keys does nothing when Redis unavailable."""
        mock_redis = MockRedisService(available=False)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_urls_for_object_keys("bucket", ["key1", "key2"])

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_empty_keys(self):
        """Test clear_urls_for_object_keys does nothing for empty keys."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise and not call sunion
        await service.clear_urls_for_object_keys("bucket", [])
        mock_redis.sunion.assert_not_called()

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_filters_empty_strings(self):
        """Test clear_urls_for_object_keys filters out empty strings."""
        mock_redis = MockRedisService()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        await service.clear_urls_for_object_keys("bucket", ["", "", ""])

        # Should not proceed since all keys are empty
        mock_redis.sunion.assert_not_called()

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_handles_exception(self):
        """Test clear_urls_for_object_keys handles exception."""
        mock_redis = MockRedisService()
        mock_redis.sunion = AsyncMock(side_effect=Exception("Redis error"))
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        # Should not raise
        await service.clear_urls_for_object_keys("bucket", ["key1.jpg", "key2.jpg"])

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_success(self):
        """Test clear_urls_for_object_keys deletes index and cached keys."""
        mock_redis = MockRedisService()
        mock_redis.sunion = AsyncMock(return_value={"cached_key_1", "cached_key_2"})
        mock_redis.delete = AsyncMock(return_value=4)
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        await service.clear_urls_for_object_keys("bucket", ["key1.jpg", "key2.jpg"])

        mock_redis.sunion.assert_called_once()
        mock_redis.delete.assert_called_once()
        # Should delete index keys + cached keys
        delete_args = mock_redis.delete.call_args[0]
        assert len(delete_args) == 4  # 2 index + 2 cached

    @pytest.mark.asyncio
    async def test_clear_urls_for_object_keys_deduplicates(self):
        """Test clear_urls_for_object_keys deduplicates object keys."""
        mock_redis = MockRedisService()
        mock_redis.sunion = AsyncMock(return_value=set())
        mock_redis.delete = AsyncMock()
        service = PresignedUrlCacheService(mock_redis)  # type: ignore

        await service.clear_urls_for_object_keys("bucket", ["key.jpg", "key.jpg", "key2.jpg", "key2.jpg"])

        # sunion should be called with only 2 unique index keys
        sunion_args = mock_redis.sunion.call_args[0]
        assert len(sunion_args) == 2


class TestIsAvailable:
    """Tests for is_available property."""

    def test_is_available_returns_redis_availability(self):
        """Test is_available reflects Redis service state."""
        available_redis = MockRedisService(available=True)
        unavailable_redis = MockRedisService(available=False)

        available_service = PresignedUrlCacheService(available_redis)  # type: ignore
        unavailable_service = PresignedUrlCacheService(unavailable_redis)  # type: ignore

        assert available_service.is_available is True
        assert unavailable_service.is_available is False


class TestModuleLevelFunctions:
    """Tests for module-level getter/setter functions."""

    def test_get_set_presigned_cache_service(self):
        """Test get/set presigned cache service instance."""
        from viewport.services.presigned_cache import get_presigned_cache_service, set_presigned_cache_service

        # Mock service
        mock_service = MagicMock()

        # Set and get
        set_presigned_cache_service(mock_service)
        assert get_presigned_cache_service() is mock_service

        # Clean up
        set_presigned_cache_service(None)
        assert get_presigned_cache_service() is None
