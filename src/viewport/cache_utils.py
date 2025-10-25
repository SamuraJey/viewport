from datetime import datetime, timedelta

# In-memory cache for presigned URLs
_url_cache: dict[str, dict[str, str | datetime]] = {}


def cache_presigned_url(photo_id: str, url: str, expires_in: int) -> None:
    """Cache a presigned URL with expiration time"""
    _url_cache[photo_id] = {
        "url": url,
        "expires_at": datetime.now() + timedelta(seconds=expires_in - 600),  # 10 min buffer for 2h URLs
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


def clear_presigned_urls_batch(photo_ids: list[str]) -> None:
    """Clear cached presigned URLs for multiple photos (batch operation)"""
    for photo_id in photo_ids:
        if photo_id in _url_cache:
            del _url_cache[photo_id]


def clear_presigned_urls_by_prefix(prefix: str) -> None:
    """Clear all cached presigned URLs that start with a prefix (e.g., 'gallery_id/')"""
    keys_to_delete = [key for key in _url_cache if key.startswith(prefix)]
    for key in keys_to_delete:
        del _url_cache[key]


def get_cache_stats() -> dict:
    """Get cache statistics for monitoring"""
    total_entries = len(_url_cache)
    expired_entries = 0
    valid_entries = 0

    now = datetime.now()
    for cached in _url_cache.values():
        expires_at = cached["expires_at"]
        if isinstance(expires_at, datetime):
            if expires_at > now:
                valid_entries += 1
            else:
                expired_entries += 1

    return {
        "total_entries": total_entries,
        "valid_entries": valid_entries,
        "expired_entries": expired_entries,
    }
