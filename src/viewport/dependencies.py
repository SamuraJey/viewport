"""
Dependency Injection for S3 Client

This module provides the FastAPI dependency injection setup for the AsyncS3Client.
The client is initialized once during application startup and shared across all requests.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, cast

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq import TaskiqDepends

from viewport.models.db import get_session_maker
from viewport.s3_service import AsyncS3Client

logger = logging.getLogger(__name__)


TASKIQ_REQUEST_DEP: Any = TaskiqDepends()

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


def get_task_context(request: Request = TASKIQ_REQUEST_DEP) -> dict[str, Any]:
    from viewport.tkq import broker

    app_state = getattr(request.app, "state", None)
    broker_state = getattr(broker, "state", None)
    return {
        "app_state": app_state,
        "broker_state": broker_state,
    }


@asynccontextmanager
async def get_task_db_session() -> AsyncGenerator[AsyncSession]:
    from viewport.tkq import broker

    broker_state = getattr(broker, "state", None)
    session_maker = getattr(broker_state, "session_maker", None) or get_session_maker()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_task_s3_client() -> AsyncS3Client:
    from viewport.tkq import broker

    broker_state = getattr(broker, "state", None)
    client = getattr(broker_state, "s3_client", None)
    if client is not None:
        return cast(AsyncS3Client, client)
    return get_s3_client_instance()
