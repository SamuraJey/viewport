"""
Caching utilities for photo endpoints
"""

import functools
from collections.abc import Callable
from typing import Any

from fastapi import Response, status
from fastapi.responses import StreamingResponse


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
