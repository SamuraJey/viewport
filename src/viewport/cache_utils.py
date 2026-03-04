from datetime import datetime, timedelta

# In-memory cache for presigned URLs
_url_cache: dict[str, dict[str, str | datetime]] = {}


def cache_presigned_url(cache_key: str, url: str, expires_in: int) -> None:
    """Cache a presigned URL with expiration time"""
    _url_cache[cache_key] = {
        "url": url,
        "expires_at": datetime.now() + timedelta(seconds=expires_in - 600),  # 10 min buffer for 2h URLs
    }


def get_cached_presigned_url(cache_key: str) -> str | None:
    """Get cached presigned URL if still valid"""
    cached = _url_cache.get(cache_key)
    if cached:
        expires_at = cached["expires_at"]
        if isinstance(expires_at, datetime) and expires_at > datetime.now():
            url = cached["url"]
            return str(url) if isinstance(url, str) else None

    if cache_key in _url_cache:
        del _url_cache[cache_key]

    return None


def clear_presigned_url_cache(cache_key: str) -> None:
    """Clear cached presigned URL for a specific photo"""
    if cache_key in _url_cache:
        del _url_cache[cache_key]


def clear_presigned_urls_batch(cache_keys: list[str]) -> None:
    """Clear cached presigned URLs for multiple photos (batch operation)"""
    for cache_key in cache_keys:
        if cache_key in _url_cache:
            del _url_cache[cache_key]
