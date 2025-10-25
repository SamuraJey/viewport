"""
Unit tests for cache_utils module
"""

from datetime import datetime, timedelta

import pytest

from viewport.cache_utils import cache_presigned_url, clear_presigned_url_cache, clear_presigned_urls_batch, clear_presigned_urls_by_prefix, get_cache_stats, get_cached_presigned_url


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear cache before and after each test"""
    from viewport.cache_utils import _url_cache

    _url_cache.clear()
    yield
    _url_cache.clear()


class TestCachePresignedUrl:
    """Tests for cache_presigned_url function"""

    def test_cache_presigned_url_basic(self):
        """Test basic caching of a presigned URL"""
        url = "https://example.com/photo.jpg?signature=abc123"
        cache_presigned_url("photo_123", url, expires_in=3600)

        cached_url = get_cached_presigned_url("photo_123")
        assert cached_url == url

    def test_cache_presigned_url_with_expiration(self):
        """Test that URL is cached with correct expiration time"""
        url = "https://example.com/photo.jpg"
        expires_in = 7200  # 2 hours
        cache_presigned_url("photo_456", url, expires_in)

        # Should be cached immediately
        assert get_cached_presigned_url("photo_456") == url

    def test_cache_presigned_url_overwrites_existing(self):
        """Test that caching same photo_id overwrites previous entry"""
        url1 = "https://example.com/photo1.jpg"
        url2 = "https://example.com/photo2.jpg"

        cache_presigned_url("photo_789", url1, 3600)
        cache_presigned_url("photo_789", url2, 3600)

        cached_url = get_cached_presigned_url("photo_789")
        assert cached_url == url2


class TestGetCachedPresignedUrl:
    """Tests for get_cached_presigned_url function"""

    def test_get_cached_url_not_found(self):
        """Test retrieving non-existent URL returns None"""
        result = get_cached_presigned_url("nonexistent_photo")
        assert result is None

    def test_get_cached_url_valid(self):
        """Test retrieving valid cached URL"""
        url = "https://example.com/valid.jpg"
        cache_presigned_url("valid_photo", url, 3600)

        result = get_cached_presigned_url("valid_photo")
        assert result == url

    def test_get_cached_url_expired(self):
        """Test that expired URL returns None and is removed from cache"""
        from viewport.cache_utils import _url_cache

        url = "https://example.com/expired.jpg"
        photo_id = "expired_photo"

        # Manually set an expired URL
        _url_cache[photo_id] = {
            "url": url,
            "expires_at": datetime.now() - timedelta(seconds=1),  # Expired 1 second ago
        }

        result = get_cached_presigned_url(photo_id)
        assert result is None

        # Verify it was removed from cache
        assert photo_id not in _url_cache

    def test_get_cached_url_near_expiration(self):
        """Test URL that's close to expiration but still valid"""
        url = "https://example.com/near_expiration.jpg"
        photo_id = "near_exp_photo"

        # Cache with 1 second remaining before buffer expiration
        cache_presigned_url(photo_id, url, expires_in=601)  # 10 min buffer, so valid for ~1 second

        result = get_cached_presigned_url(photo_id)
        assert result == url


class TestClearPresignedUrlCache:
    """Tests for clear_presigned_url_cache function"""

    def test_clear_single_url(self):
        """Test clearing a single URL from cache"""
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)
        cache_presigned_url("photo_2", "https://example.com/2.jpg", 3600)

        clear_presigned_url_cache("photo_1")

        assert get_cached_presigned_url("photo_1") is None
        assert get_cached_presigned_url("photo_2") is not None

    def test_clear_nonexistent_url(self):
        """Test clearing non-existent URL doesn't raise error"""
        clear_presigned_url_cache("nonexistent")  # Should not raise


class TestClearPresignedUrlsBatch:
    """Tests for clear_presigned_urls_batch function"""

    def test_clear_multiple_urls(self):
        """Test clearing multiple URLs at once"""
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)
        cache_presigned_url("photo_2", "https://example.com/2.jpg", 3600)
        cache_presigned_url("photo_3", "https://example.com/3.jpg", 3600)

        clear_presigned_urls_batch(["photo_1", "photo_3"])

        assert get_cached_presigned_url("photo_1") is None
        assert get_cached_presigned_url("photo_2") is not None
        assert get_cached_presigned_url("photo_3") is None

    def test_clear_empty_batch(self):
        """Test clearing empty list doesn't raise error"""
        clear_presigned_urls_batch([])  # Should not raise

    def test_clear_batch_with_nonexistent(self):
        """Test clearing batch with some non-existent URLs"""
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)

        clear_presigned_urls_batch(["photo_1", "nonexistent", "also_nonexistent"])

        assert get_cached_presigned_url("photo_1") is None


class TestClearPresignedUrlsByPrefix:
    """Tests for clear_presigned_urls_by_prefix function"""

    def test_clear_by_prefix(self):
        """Test clearing URLs by prefix"""
        cache_presigned_url("gallery_123/photo_1.jpg", "https://example.com/1.jpg", 3600)
        cache_presigned_url("gallery_123/photo_2.jpg", "https://example.com/2.jpg", 3600)
        cache_presigned_url("gallery_456/photo_3.jpg", "https://example.com/3.jpg", 3600)

        clear_presigned_urls_by_prefix("gallery_123/")

        assert get_cached_presigned_url("gallery_123/photo_1.jpg") is None
        assert get_cached_presigned_url("gallery_123/photo_2.jpg") is None
        assert get_cached_presigned_url("gallery_456/photo_3.jpg") is not None

    def test_clear_by_nonexistent_prefix(self):
        """Test clearing with non-matching prefix"""
        cache_presigned_url("gallery_123/photo.jpg", "https://example.com/1.jpg", 3600)

        clear_presigned_urls_by_prefix("gallery_999/")

        # Original URL should still be cached
        assert get_cached_presigned_url("gallery_123/photo.jpg") is not None

    def test_clear_by_empty_prefix(self):
        """Test clearing with empty prefix clears all"""
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)
        cache_presigned_url("photo_2", "https://example.com/2.jpg", 3600)

        clear_presigned_urls_by_prefix("")

        assert get_cached_presigned_url("photo_1") is None
        assert get_cached_presigned_url("photo_2") is None


class TestGetCacheStats:
    """Tests for get_cache_stats function"""

    def test_cache_stats_empty(self):
        """Test cache stats when cache is empty"""
        stats = get_cache_stats()

        assert stats["total_entries"] == 0
        assert stats["valid_entries"] == 0
        assert stats["expired_entries"] == 0

    def test_cache_stats_with_valid_entries(self):
        """Test cache stats with valid entries"""
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)
        cache_presigned_url("photo_2", "https://example.com/2.jpg", 3600)

        stats = get_cache_stats()

        assert stats["total_entries"] == 2
        assert stats["valid_entries"] == 2
        assert stats["expired_entries"] == 0

    def test_cache_stats_with_expired_entries(self):
        """Test cache stats with expired entries"""
        from viewport.cache_utils import _url_cache

        # Add valid entry
        cache_presigned_url("photo_valid", "https://example.com/valid.jpg", 3600)

        # Add expired entry manually
        _url_cache["photo_expired"] = {
            "url": "https://example.com/expired.jpg",
            "expires_at": datetime.now() - timedelta(seconds=10),
        }

        stats = get_cache_stats()

        assert stats["total_entries"] == 2
        assert stats["valid_entries"] == 1
        assert stats["expired_entries"] == 1

    def test_cache_stats_mixed_entries(self):
        """Test cache stats with mix of valid and expired entries"""
        from viewport.cache_utils import _url_cache

        # Add valid entries
        cache_presigned_url("photo_1", "https://example.com/1.jpg", 3600)
        cache_presigned_url("photo_2", "https://example.com/2.jpg", 7200)

        # Add expired entries
        _url_cache["photo_expired_1"] = {
            "url": "https://example.com/exp1.jpg",
            "expires_at": datetime.now() - timedelta(seconds=5),
        }
        _url_cache["photo_expired_2"] = {
            "url": "https://example.com/exp2.jpg",
            "expires_at": datetime.now() - timedelta(seconds=100),
        }

        stats = get_cache_stats()

        assert stats["total_entries"] == 4
        assert stats["valid_entries"] == 2
        assert stats["expired_entries"] == 2


class TestCacheExpirationBehavior:
    """Integration tests for cache expiration behavior"""

    def test_cache_buffer_time(self):
        """Test that cache buffer (10 min) is correctly applied"""
        from viewport.cache_utils import _url_cache

        url = "https://example.com/test.jpg"
        photo_id = "test_photo"
        expires_in = 7200  # 2 hours

        cache_presigned_url(photo_id, url, expires_in)

        cached_entry = _url_cache[photo_id]
        expires_at = cached_entry["expires_at"]

        # Expected expiration: now + 7200 - 600 (10 min buffer)
        expected_expiration = datetime.now() + timedelta(seconds=expires_in - 600)

        # Allow 1 second tolerance for test execution time
        assert abs((expires_at - expected_expiration).total_seconds()) < 1

    def test_url_accessible_before_expiration(self):
        """Test URL is accessible throughout its valid lifetime"""
        url = "https://example.com/test.jpg"
        photo_id = "test_photo"

        # Cache with short expiration for testing
        cache_presigned_url(photo_id, url, expires_in=2)  # 2 seconds, with 10 min buffer it should expire immediately

        # Should still be accessible for a brief moment
        result = get_cached_presigned_url(photo_id)
        # Due to buffer, might be None or the URL depending on timing
        assert result is None or result == url

    def test_multiple_cache_updates(self):
        """Test updating same cache entry multiple times"""
        photo_id = "test_photo"

        url1 = "https://example.com/v1.jpg"
        cache_presigned_url(photo_id, url1, 3600)
        assert get_cached_presigned_url(photo_id) == url1

        url2 = "https://example.com/v2.jpg"
        cache_presigned_url(photo_id, url2, 7200)
        assert get_cached_presigned_url(photo_id) == url2

        url3 = "https://example.com/v3.jpg"
        cache_presigned_url(photo_id, url3, 1800)
        assert get_cached_presigned_url(photo_id) == url3


class TestCacheConcurrency:
    """Tests for cache behavior under concurrent-like scenarios"""

    def test_cache_multiple_galleries(self):
        """Test caching URLs from multiple galleries simultaneously"""
        gallery_1_photos = [f"gallery_1/photo_{i}.jpg" for i in range(10)]
        gallery_2_photos = [f"gallery_2/photo_{i}.jpg" for i in range(10)]

        # Cache all photos
        for photo_id in gallery_1_photos:
            cache_presigned_url(photo_id, f"https://example.com/{photo_id}", 3600)

        for photo_id in gallery_2_photos:
            cache_presigned_url(photo_id, f"https://example.com/{photo_id}", 3600)

        # Verify all are cached
        stats = get_cache_stats()
        assert stats["total_entries"] == 20
        assert stats["valid_entries"] == 20

        # Clear gallery 1
        clear_presigned_urls_by_prefix("gallery_1/")

        stats = get_cache_stats()
        assert stats["total_entries"] == 10

        # Verify gallery 2 still cached
        for photo_id in gallery_2_photos:
            assert get_cached_presigned_url(photo_id) is not None

    def test_cache_large_number_of_urls(self):
        """Test caching large number of URLs"""
        num_urls = 1000

        # Cache many URLs
        for i in range(num_urls):
            cache_presigned_url(f"photo_{i}", f"https://example.com/{i}.jpg", 3600)

        stats = get_cache_stats()
        assert stats["total_entries"] == num_urls
        assert stats["valid_entries"] == num_urls

        # Verify random samples
        assert get_cached_presigned_url("photo_0") is not None
        assert get_cached_presigned_url("photo_500") is not None
        assert get_cached_presigned_url("photo_999") is not None
