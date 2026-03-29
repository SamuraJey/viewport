from unittest.mock import patch

from viewport.redis_client import RedisSettings, create_redis_client


class TestCreateRedisClient:
    def test_create_redis_client_uses_fail_fast_defaults(self):
        with patch("viewport.redis_client.ConnectionPool.from_url") as mock_from_url, patch("viewport.redis_client.Redis") as mock_redis:
            mock_pool = object()
            mock_from_url.return_value = mock_pool

            create_redis_client()

            _, kwargs = mock_from_url.call_args
            assert kwargs["socket_connect_timeout"] == 1.0
            assert kwargs["socket_timeout"] == 1.0
            assert kwargs["retry_on_timeout"] is True
            mock_redis.assert_called_once_with(connection_pool=mock_pool)

    def test_create_redis_client_uses_custom_timeout_settings(self):
        settings = RedisSettings(
            redis_url="redis://example:6379/2",
            max_connections=10,
            redis_socket_connect_timeout=0.2,
            redis_socket_timeout=0.4,
            redis_retry_on_timeout=True,
        )

        with patch("viewport.redis_client.ConnectionPool.from_url") as mock_from_url, patch("viewport.redis_client.Redis") as mock_redis:
            mock_pool = object()
            mock_from_url.return_value = mock_pool

            create_redis_client(settings=settings)

            mock_from_url.assert_called_once_with(
                "redis://example:6379/2",
                decode_responses=True,
                max_connections=10,
                socket_connect_timeout=0.2,
                socket_timeout=0.4,
                retry_on_timeout=True,
            )
            mock_redis.assert_called_once_with(connection_pool=mock_pool)
