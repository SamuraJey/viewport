import importlib
import warnings
from unittest.mock import MagicMock, patch


def test_redis_client_deprecated_shim_behaviour():
    import viewport.redis_client as redis_client

    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always", DeprecationWarning)
        redis_client = importlib.reload(redis_client)

    assert any("deprecated" in str(item.message).lower() for item in captured)

    redis_client.get_redis_settings.cache_clear()
    first_settings = redis_client.get_redis_settings()
    second_settings = redis_client.get_redis_settings()
    assert first_settings is second_settings

    explicit_settings = redis_client.RedisSettings(
        redis_url="redis://localhost:6379/9",
        max_connections=7,
        redis_socket_connect_timeout=2.5,
        redis_socket_timeout=3.5,
        redis_retry_on_timeout=False,
    )

    fake_pool = MagicMock(name="pool")
    fake_client = MagicMock(name="redis-client")

    with (
        patch.object(redis_client.ConnectionPool, "from_url", return_value=fake_pool) as mock_from_url,
        patch.object(redis_client, "Redis", return_value=fake_client) as mock_redis,
    ):
        created = redis_client.create_redis_client(explicit_settings)

    assert created is fake_client
    mock_from_url.assert_called_once_with(
        "redis://localhost:6379/9",
        decode_responses=True,
        max_connections=7,
        socket_connect_timeout=2.5,
        socket_timeout=3.5,
        retry_on_timeout=False,
    )
    mock_redis.assert_called_once_with(connection_pool=fake_pool)

    with (
        patch.object(redis_client, "get_redis_settings", return_value=explicit_settings),
        patch.object(redis_client.ConnectionPool, "from_url", return_value=fake_pool),
        patch.object(redis_client, "Redis", return_value=fake_client),
    ):
        assert redis_client.create_redis_client() is fake_client

    redis_client.set_redis_client_instance(fake_client)
    assert redis_client.get_redis_client_instance() is fake_client

    redis_client.set_redis_client_instance(None)
    assert redis_client.get_redis_client_instance() is None
