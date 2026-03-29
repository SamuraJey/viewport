"""
Tests for cache_utils module.

This module contains tests for Redis caching utilities used for presigned URL caching.
Tests cover edge cases, null handling, and Redis pipeline operations.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from viewport.cache_utils import (
    _index_key_from_cache_key,
    cache_presigned_url,
    cache_presigned_urls_batch,
    clear_presigned_url_cache,
    clear_presigned_urls_batch,
    clear_presigned_urls_for_object_keys,
    get_cached_presigned_url,
    get_cached_presigned_urls_batch,
)


class TestIndexKeyFromCacheKey:
    """Tests for _index_key_from_cache_key function."""

    def test_index_key_from_cache_key_with_no_prefix(self):
        """Test _index_key_from_cache_key when cache_key has no colons (line 48)."""
        cache_key = "simplekey"
        result = _index_key_from_cache_key(cache_key)
        assert result == "simplekey:idx"

    def test_index_key_from_cache_key_with_prefix(self):
        """Test _index_key_from_cache_key with standard cache key (line 49)."""
        cache_key = "presign:bucket:encoded_key:disposition_hash"
        result = _index_key_from_cache_key(cache_key)
        assert result == "presign:bucket:encoded_key:idx"


class TestCachePresignedUrl:
    """Tests for cache_presigned_url function."""

    @pytest.mark.asyncio
    async def test_cache_presigned_url_with_none_redis_client(self):
        """Test cache_presigned_url returns early when redis_client is None (line 54)."""
        result = await cache_presigned_url(None, "cache_key", "https://example.com", 3600)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_presigned_url_with_valid_redis_client(self):
        """Test cache_presigned_url executes pipeline commands."""
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_pipeline.set = MagicMock()
        mock_pipeline.sadd = MagicMock()
        mock_pipeline.expire = MagicMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        await cache_presigned_url(mock_redis, "test_key", "https://example.com", 3600)

        mock_redis.pipeline.assert_called_once_with(transaction=False)
        mock_pipeline.set.assert_called_once()
        mock_pipeline.sadd.assert_called_once()
        mock_pipeline.expire.assert_called_once()
        mock_pipeline.execute.assert_called_once()


class TestCachePresignedUrlsBatch:
    """Tests for cache_presigned_urls_batch function."""

    @pytest.mark.asyncio
    async def test_cache_presigned_urls_batch_with_none_redis_client(self):
        """Test cache_presigned_urls_batch returns early when redis_client is None (line 72)."""
        key_value_pairs = [("key1", "url1"), ("key2", "url2")]
        result = await cache_presigned_urls_batch(None, key_value_pairs, 3600)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_presigned_urls_batch_with_empty_pairs(self):
        """Test cache_presigned_urls_batch returns early when key_value_pairs is empty (line 72)."""
        mock_redis = AsyncMock()
        result = await cache_presigned_urls_batch(mock_redis, [], 3600)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_presigned_urls_batch_with_valid_pairs(self):
        """Test cache_presigned_urls_batch executes pipeline commands for multiple URLs."""
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_pipeline.set = MagicMock()
        mock_pipeline.sadd = MagicMock()
        mock_pipeline.expire = MagicMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        key_value_pairs = [
            ("cache_key1", "https://url1.example.com"),
            ("cache_key2", "https://url2.example.com"),
        ]
        await cache_presigned_urls_batch(mock_redis, key_value_pairs, 3600)

        mock_redis.pipeline.assert_called_once_with(transaction=False)
        assert mock_pipeline.set.call_count == 2
        assert mock_pipeline.sadd.call_count == 2
        assert mock_pipeline.expire.call_count == 2
        mock_pipeline.execute.assert_called_once()


class TestGetCachedPresignedUrl:
    """Tests for get_cached_presigned_url function."""

    @pytest.mark.asyncio
    async def test_get_cached_presigned_url_with_none_redis_client(self):
        """Test get_cached_presigned_url returns None when redis_client is None (line 86)."""
        result = await get_cached_presigned_url(None, "cache_key")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_cached_presigned_url_with_existing_value(self):
        """Test get_cached_presigned_url returns cached value."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=b"https://cached.example.com")

        result = await get_cached_presigned_url(mock_redis, "cache_key")

        assert result == "https://cached.example.com"
        mock_redis.get.assert_called_once_with("cache_key")

    @pytest.mark.asyncio
    async def test_get_cached_presigned_url_with_existing_string_value(self):
        """Test get_cached_presigned_url passes through decoded string values."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="https://cached.example.com")

        result = await get_cached_presigned_url(mock_redis, "cache_key")

        assert result == "https://cached.example.com"
        mock_redis.get.assert_called_once_with("cache_key")

    @pytest.mark.asyncio
    async def test_get_cached_presigned_url_with_no_value(self):
        """Test get_cached_presigned_url returns None when key doesn't exist."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)

        result = await get_cached_presigned_url(mock_redis, "nonexistent_key")

        assert result is None
        mock_redis.get.assert_called_once_with("nonexistent_key")


class TestGetCachedPresignedUrlsBatch:
    """Tests for get_cached_presigned_urls_batch function."""

    @pytest.mark.asyncio
    async def test_get_cached_presigned_urls_batch_with_none_redis_client(self):
        """Test get_cached_presigned_urls_batch returns empty dict when redis_client is None (line 93)."""
        result = await get_cached_presigned_urls_batch(None, ["key1", "key2"])
        assert result == {}

    @pytest.mark.asyncio
    async def test_get_cached_presigned_urls_batch_with_empty_cache_keys(self):
        """Test get_cached_presigned_urls_batch returns empty dict when cache_keys is empty (line 93)."""
        mock_redis = AsyncMock()
        result = await get_cached_presigned_urls_batch(mock_redis, [])
        assert result == {}

    @pytest.mark.asyncio
    async def test_get_cached_presigned_urls_batch_with_mixed_results(self):
        """Test get_cached_presigned_urls_batch returns only non-None values."""
        mock_redis = AsyncMock()
        mock_redis.mget = AsyncMock(return_value=[b"url1", None, b"url3"])

        result = await get_cached_presigned_urls_batch(mock_redis, ["key1", "key2", "key3"])

        assert len(result) == 2
        assert "key1" in result
        assert "key3" in result
        assert "key2" not in result
        assert result["key1"] == "url1"
        assert result["key3"] == "url3"


class TestClearPresignedUrlCache:
    """Tests for clear_presigned_url_cache function."""

    @pytest.mark.asyncio
    async def test_clear_presigned_url_cache_with_none_redis_client(self):
        """Test clear_presigned_url_cache returns early when redis_client is None (lines 100-101)."""
        result = await clear_presigned_url_cache(None, "cache_key")
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_url_cache_with_valid_redis_client(self):
        """Test clear_presigned_url_cache deletes cache key and removes from index (lines 102-106)."""
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_pipeline.delete = MagicMock()
        mock_pipeline.srem = MagicMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        await clear_presigned_url_cache(mock_redis, "presign:bucket:key:hash")

        mock_redis.pipeline.assert_called_once_with(transaction=False)
        mock_pipeline.delete.assert_called_once_with("presign:bucket:key:hash")
        mock_pipeline.srem.assert_called_once()
        mock_pipeline.execute.assert_called_once()


class TestClearPresignedUrlsBatch:
    """Tests for clear_presigned_urls_batch function."""

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_batch_with_none_redis_client(self):
        """Test clear_presigned_urls_batch returns early when redis_client is None (lines 110-111)."""
        result = await clear_presigned_urls_batch(None, ["key1", "key2"])
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_batch_with_empty_cache_keys(self):
        """Test clear_presigned_urls_batch returns early when cache_keys is empty (lines 110-111)."""
        mock_redis = AsyncMock()
        result = await clear_presigned_urls_batch(mock_redis, [])
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_batch_with_valid_keys(self):
        """Test clear_presigned_urls_batch deletes all cache keys and updates indexes (lines 112-116)."""
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_pipeline.delete = MagicMock()
        mock_pipeline.srem = MagicMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        cache_keys = ["presign:bucket:key1:hash", "presign:bucket:key2:hash"]
        await clear_presigned_urls_batch(mock_redis, cache_keys)

        mock_redis.pipeline.assert_called_once_with(transaction=False)
        mock_pipeline.delete.assert_called_once()
        assert mock_pipeline.srem.call_count == 2
        mock_pipeline.execute.assert_called_once()


class TestClearPresignedUrlsForObjectKeys:
    """Tests for clear_presigned_urls_for_object_keys function."""

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_with_none_redis_client(self):
        """Test returns early when redis_client is None (line 125)."""
        result = await clear_presigned_urls_for_object_keys(None, "bucket", ["key1", "key2"])
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_with_empty_object_keys(self):
        """Test returns early when deduplicated_object_keys is empty (line 129)."""
        mock_redis = AsyncMock()
        result = await clear_presigned_urls_for_object_keys(mock_redis, "bucket", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_with_empty_string_keys(self):
        """Test returns early when object_keys contains only empty strings (line 129)."""
        mock_redis = AsyncMock()
        result = await clear_presigned_urls_for_object_keys(mock_redis, "bucket", ["", "", ""])
        assert result is None

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_with_no_cached_members(self):
        """Test clears only index keys when no cached members exist (line 136)."""
        mock_redis = AsyncMock()
        mock_redis.sunion = AsyncMock(return_value=set())
        mock_redis.delete = AsyncMock()

        await clear_presigned_urls_for_object_keys(mock_redis, "test-bucket", ["photo1.jpg", "photo2.jpg"])

        mock_redis.sunion.assert_called_once()
        mock_redis.delete.assert_called_once()
        # Should delete only the index keys when cached_members is empty
        delete_args = mock_redis.delete.call_args[0]
        assert len(delete_args) == 2  # Only index keys

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_with_cached_members(self):
        """Test clears both index keys and cached members (line 136)."""
        mock_redis = AsyncMock()
        mock_redis.sunion = AsyncMock(return_value={b"presign:bucket:key1:hash1", b"presign:bucket:key2:hash2"})
        mock_redis.delete = AsyncMock()

        await clear_presigned_urls_for_object_keys(mock_redis, "test-bucket", ["photo1.jpg", "photo2.jpg"])

        mock_redis.sunion.assert_called_once()
        mock_redis.delete.assert_called_once()
        # Should delete index keys + cached members
        # delete is called with *list(keys_to_delete), so we get all args
        delete_args = mock_redis.delete.call_args[0]
        assert len(delete_args) == 4  # 2 index keys + 2 cached members
        assert "presign:bucket:key1:hash1" in delete_args
        assert "presign:bucket:key2:hash2" in delete_args

    @pytest.mark.asyncio
    async def test_clear_presigned_urls_for_object_keys_deduplicates_keys(self):
        """Test deduplicates object keys before processing."""
        mock_redis = AsyncMock()
        mock_redis.sunion = AsyncMock(return_value=set())
        mock_redis.delete = AsyncMock()

        await clear_presigned_urls_for_object_keys(mock_redis, "test-bucket", ["photo1.jpg", "photo1.jpg", "photo2.jpg", "photo2.jpg"])

        mock_redis.sunion.assert_called_once()
        # Should only create 2 index keys (deduplicated)
        sunion_args = mock_redis.sunion.call_args[0]
        assert len(sunion_args) == 2
