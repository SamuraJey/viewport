"""
Caching utilities for presigned URLs
"""

from datetime import datetime, timedelta

# In-memory cache for presigned URLs
_url_cache: dict[str, dict[str, str | datetime]] = {}


def cache_presigned_url(photo_id: str, url: str, expires_in: int) -> None:
    """Cache a presigned URL with expiration time"""
    _url_cache[photo_id] = {
        "url": url,
        "expires_at": datetime.now() + timedelta(seconds=expires_in - 300),  # 5 min buffer
    }


def get_cached_presigned_url(photo_id: str) -> str | None:
    """Get cached presigned URL if still valid"""
    cached = _url_cache.get(photo_id)
    if cached:
        expires_at = cached["expires_at"]
        if isinstance(expires_at, datetime) and expires_at > datetime.now():
            url = cached["url"]
            return str(url) if isinstance(url, str) else None

    if photo_id in _url_cache:
        del _url_cache[photo_id]

    return None


def clear_presigned_url_cache(photo_id: str) -> None:
    """Clear cached presigned URL for a specific photo"""
    if photo_id in _url_cache:
        del _url_cache[photo_id]
