"""
Tests for RedisService.

Tests cover connection management, graceful degradation, and common operations.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import RedisError

from viewport.services.redis_service import RedisService, RedisSettings, _NoOpPipelineContext


class TestRedisSettings:
    """Tests for RedisSettings configuration."""

    def test_default_settings_fields(self):
        """Test that RedisSettings has expected fields with defaults."""
        settings = RedisSettings()
        # Don't check redis_url as it can be overridden by env/fixtures
        assert settings.redis_max_connections == 20
        assert settings.redis_socket_connect_timeout == 1.0
        assert settings.redis_socket_timeout == 1.0
        assert settings.redis_retry_on_timeout is True
        assert settings.redis_decode_responses is True


class TestRedisServiceCreate:
    """Tests for RedisService.create() factory method."""

    @pytest.mark.asyncio
    async def test_create_successful_connection(self):
        """Test successful Redis connection."""
        with (
            patch("viewport.services.redis_service.ConnectionPool.from_url") as _mock_pool,
            patch("viewport.services.redis_service.Redis") as mock_redis_class,
        ):
            mock_client = AsyncMock()
            mock_client.ping = AsyncMock()
            mock_redis_class.return_value = mock_client

            service = await RedisService.create()

            assert service.is_available is True
            mock_client.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_with_redis_error_degrades_gracefully(self):
        """Test graceful degradation when Redis is unavailable."""
        with (
            patch("viewport.services.redis_service.ConnectionPool.from_url") as _mock_pool,
            patch("viewport.services.redis_service.Redis") as mock_redis_class,
        ):
            mock_client = AsyncMock()
            mock_client.ping = AsyncMock(side_effect=RedisError("Connection refused"))
            mock_redis_class.return_value = mock_client

            service = await RedisService.create()

            assert service.is_available is False

    @pytest.mark.asyncio
    async def test_create_with_generic_exception_degrades_gracefully(self):
        """Test graceful degradation on generic exception."""
        with patch("viewport.services.redis_service.ConnectionPool.from_url") as mock_pool:
            mock_pool.side_effect = Exception("Network error")

            service = await RedisService.create()

            assert service.is_available is False


class TestRedisServiceOperations:
    """Tests for RedisService operations."""

    @pytest.mark.asyncio
    async def test_get_returns_none_when_unavailable(self):
        """Test get returns None when Redis is unavailable."""
        service = RedisService(None, None, available=False)
        result = await service.get("key")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_returns_value(self):
        """Test get returns cached value."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value="cached_value")
        service = RedisService(mock_client, None, available=True)

        result = await service.get("test_key")

        assert result == "cached_value"
        mock_client.get.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_get_handles_redis_error(self):
        """Test get returns None on Redis error."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=RedisError("Timeout"))
        service = RedisService(mock_client, None, available=True)

        result = await service.get("test_key")

        assert result is None

    @pytest.mark.asyncio
    async def test_set_returns_false_when_unavailable(self):
        """Test set returns False when Redis is unavailable."""
        service = RedisService(None, None, available=False)
        result = await service.set("key", "value")
        assert result is False

    @pytest.mark.asyncio
    async def test_set_success(self):
        """Test successful set operation."""
        mock_client = AsyncMock()
        mock_client.set = AsyncMock()
        service = RedisService(mock_client, None, available=True)

        result = await service.set("key", "value", ex=3600)

        assert result is True
        mock_client.set.assert_called_once_with("key", "value", ex=3600)

    @pytest.mark.asyncio
    async def test_mget_returns_empty_dict_when_unavailable(self):
        """Test mget returns empty dict when Redis is unavailable."""
        service = RedisService(None, None, available=False)
        result = await service.mget(["key1", "key2"])
        assert result == {}

    @pytest.mark.asyncio
    async def test_mget_returns_only_found_keys(self):
        """Test mget returns only keys that exist."""
        mock_client = AsyncMock()
        mock_client.mget = AsyncMock(return_value=["value1", None, "value3"])
        service = RedisService(mock_client, None, available=True)

        result = await service.mget(["key1", "key2", "key3"])

        assert result == {"key1": "value1", "key3": "value3"}

    @pytest.mark.asyncio
    async def test_delete_returns_zero_when_unavailable(self):
        """Test delete returns 0 when Redis is unavailable."""
        service = RedisService(None, None, available=False)
        result = await service.delete("key")
        assert result == 0

    @pytest.mark.asyncio
    async def test_delete_success(self):
        """Test successful delete operation."""
        mock_client = AsyncMock()
        mock_client.delete = AsyncMock(return_value=2)
        service = RedisService(mock_client, None, available=True)

        result = await service.delete("key1", "key2")

        assert result == 2
        mock_client.delete.assert_called_once_with("key1", "key2")

    @pytest.mark.asyncio
    async def test_sunion_returns_empty_set_when_unavailable(self):
        """Test sunion returns empty set when Redis is unavailable."""
        service = RedisService(None, None, available=False)
        result = await service.sunion("key1", "key2")
        assert result == set()

    @pytest.mark.asyncio
    async def test_sunion_success(self):
        """Test successful sunion operation."""
        mock_client = AsyncMock()
        mock_client.sunion = AsyncMock(return_value={"member1", "member2"})
        service = RedisService(mock_client, None, available=True)

        result = await service.sunion("set1", "set2")

        assert result == {"member1", "member2"}


class TestRedisServicePipeline:
    """Tests for RedisService pipeline operations."""

    @pytest.mark.asyncio
    async def test_pipeline_returns_noop_when_unavailable(self):
        """Test pipeline returns NoOp context when Redis is unavailable."""
        service = RedisService(None, None, available=False)

        async with service.pipeline() as pipe:
            pipe.set("key", "value")
            result = await pipe.execute()

        assert result == []

    @pytest.mark.asyncio
    async def test_pipeline_executes_commands(self):
        """Test pipeline executes batched commands."""
        mock_client = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_pipeline.set = MagicMock()
        mock_pipeline.execute = AsyncMock(return_value=["OK", "OK"])
        mock_client.pipeline = MagicMock(return_value=mock_pipeline)
        service = RedisService(mock_client, None, available=True)

        async with service.pipeline() as pipe:
            pipe.set("key1", "value1", ex=3600)
            pipe.set("key2", "value2", ex=3600)
            result = await pipe.execute()

        assert result == ["OK", "OK"]
        assert mock_pipeline.set.call_count == 2


class TestNoOpPipelineContext:
    """Tests for _NoOpPipelineContext."""

    @pytest.mark.asyncio
    async def test_all_methods_return_self(self):
        """Test all pipeline methods return self for chaining."""
        ctx = _NoOpPipelineContext()

        assert ctx.set("k", "v") is ctx
        assert ctx.get("k") is ctx
        assert ctx.delete("k") is ctx
        assert ctx.sadd("k", "m") is ctx
        assert ctx.srem("k", "m") is ctx
        assert ctx.expire("k", 60) is ctx

    @pytest.mark.asyncio
    async def test_execute_returns_empty_list(self):
        """Test execute returns empty list."""
        ctx = _NoOpPipelineContext()
        result = await ctx.execute()
        assert result == []


class TestRedisServiceClose:
    """Tests for RedisService.close()."""

    @pytest.mark.asyncio
    async def test_close_cleans_up_resources(self):
        """Test close properly cleans up resources."""
        mock_client = AsyncMock()
        mock_client.aclose = AsyncMock()
        service = RedisService(mock_client, MagicMock(), available=True)

        await service.close()

        mock_client.aclose.assert_called_once()
        assert service.is_available is False
        assert service._client is None

    @pytest.mark.asyncio
    async def test_close_handles_already_closed(self):
        """Test close handles already closed state."""
        service = RedisService(None, None, available=False)
        # Should not raise
        await service.close()
        assert service.is_available is False
