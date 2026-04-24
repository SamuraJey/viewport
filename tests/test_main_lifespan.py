import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI


@pytest.fixture
def main_module():
    with (
        patch("viewport.logging_config.configure_logging"),
        patch("viewport.metrics.setup_metrics"),
        patch("viewport.models.db.get_engine", return_value=MagicMock(name="engine")),
        patch("sqladmin.Admin"),
    ):
        import viewport.main as imported_main

        yield importlib.reload(imported_main)

    import viewport.main as restored_main

    importlib.reload(restored_main)


@pytest.mark.asyncio
async def test_lifespan_reraises_startup_error(main_module):
    startup_error = RuntimeError("s3 init failed")

    with patch.object(main_module, "AsyncS3Client", side_effect=startup_error), patch.object(main_module, "logger") as mock_logger, pytest.raises(RuntimeError, match="s3 init failed"):
        async with main_module.lifespan(FastAPI()):
            pass

    mock_logger.error.assert_called_once_with("Failed to initialize S3 client: %s", startup_error)


@pytest.mark.asyncio
async def test_lifespan_logs_s3_shutdown_error(main_module):
    s3_close_error = RuntimeError("s3 close failed")
    mock_s3_client = MagicMock()
    mock_s3_client.close = AsyncMock(side_effect=s3_close_error)

    mock_redis_service = MagicMock()
    mock_redis_service.is_available = True
    mock_redis_service.close = AsyncMock()

    with (
        patch.object(main_module, "AsyncS3Client", return_value=mock_s3_client),
        patch.object(main_module, "get_s3_client_instance", return_value=mock_s3_client),
        patch.object(main_module.RedisService, "create", new=AsyncMock(return_value=mock_redis_service)),
        patch.object(main_module, "set_s3_client_instance"),
        patch.object(main_module, "set_redis_service"),
        patch.object(main_module, "set_presigned_cache_service"),
        patch.object(main_module, "logger") as mock_logger,
    ):
        async with main_module.lifespan(FastAPI()):
            pass

    mock_logger.error.assert_any_call("Error during S3 client shutdown: %s", s3_close_error)


@pytest.mark.asyncio
async def test_lifespan_logs_redis_shutdown_error(main_module):
    redis_close_error = RuntimeError("redis close failed")
    mock_s3_client = MagicMock()
    mock_s3_client.close = AsyncMock()

    mock_redis_service = MagicMock()
    mock_redis_service.is_available = True
    mock_redis_service.close = AsyncMock(side_effect=redis_close_error)

    with (
        patch.object(main_module, "AsyncS3Client", return_value=mock_s3_client),
        patch.object(main_module, "get_s3_client_instance", return_value=mock_s3_client),
        patch.object(main_module.RedisService, "create", new=AsyncMock(return_value=mock_redis_service)),
        patch.object(main_module, "set_s3_client_instance"),
        patch.object(main_module, "set_redis_service"),
        patch.object(main_module, "set_presigned_cache_service"),
        patch.object(main_module, "logger") as mock_logger,
    ):
        async with main_module.lifespan(FastAPI()):
            pass

    mock_logger.error.assert_any_call("Error during Redis service shutdown: %s", redis_close_error)
