"""
Caching utilities for photo endpoints
"""

import functools
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from fastapi import Response, status
from fastapi.responses import JSONResponse, StreamingResponse

# In-memory cache for presigned URLs
_url_cache: dict[str, dict[str, Any]] = {}


def cache_presigned_url(photo_id: str, url: str, expires_in: int) -> None:
    """Cache a presigned URL with expiration time"""
    _url_cache[photo_id] = {
        "url": url,
        "expires_at": datetime.now() + timedelta(seconds=expires_in - 300),  # 5 min buffer
    }


def get_cached_presigned_url(photo_id: str) -> str | None:
    """Get cached presigned URL if still valid"""
    cached = _url_cache.get(photo_id)
    if cached and cached["expires_at"] > datetime.now():
        return cached["url"]

    # Clean up expired cache entry
    if photo_id in _url_cache:
        del _url_cache[photo_id]

    return None


def url_cache(max_age: int = 3600):
    """
    Decorator to add HTTP caching headers for presigned URL endpoints.

    Args:
        max_age: Cache duration in seconds (default: 1 hour)
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Call the original function
            result = func(*args, **kwargs)

            # Add caching headers to the response
            if isinstance(result, dict):
                # Create JSONResponse with cache headers
                return JSONResponse(content=result, headers={"Cache-Control": f"private, max-age={max_age}", "Vary": "Authorization"})
            elif isinstance(result, Response):
                result.headers["Cache-Control"] = f"private, max-age={max_age}"
                result.headers["Vary"] = "Authorization"

            return result

        return wrapper

    return decorator


def photo_cache(max_age: int = 3600, public: bool = True):
    """
    Decorator to add HTTP caching headers to photo endpoints.

    Args:
        max_age: Cache duration in seconds (default: 1 hour)
        public: Whether cache is public or private (default: True)
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Extract request and photo_id from kwargs
            request = kwargs.get("request")
            photo_id = kwargs.get("photo_id")

            # Handle conditional GET via ETag if photo_id is available
            if photo_id and request and hasattr(request, "headers"):
                etag = f'"{photo_id}"'
                if request.headers.get("if-none-match") == etag:
                    return Response(status_code=status.HTTP_304_NOT_MODIFIED)

            # Call the original function
            result = func(*args, **kwargs)

            # Add caching headers to the response
            if isinstance(result, StreamingResponse | Response):
                cache_control = f"{'public' if public else 'private'}, max-age={max_age}"
                result.headers["Cache-Control"] = cache_control

                if photo_id:
                    result.headers["ETag"] = f'"{photo_id}"'

            return result

        return wrapper

    return decorator
