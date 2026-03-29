from types import SimpleNamespace

import pytest

import viewport.dependencies as dependencies


def test_get_s3_client_instance_raises_when_uninitialized(monkeypatch):
    monkeypatch.setattr(dependencies, "_s3_client_instance", None)

    with pytest.raises(RuntimeError, match="S3 client not initialized"):
        dependencies.get_s3_client_instance()


@pytest.mark.asyncio
async def test_get_redis_yields_current_service(monkeypatch):
    redis_service = SimpleNamespace(is_available=True)
    monkeypatch.setattr(dependencies, "get_redis_service", lambda: redis_service)

    generator = dependencies.get_redis()

    assert await anext(generator) is redis_service
    with pytest.raises(StopAsyncIteration):
        await anext(generator)


@pytest.mark.asyncio
async def test_get_presigned_cache_yields_current_service(monkeypatch):
    presigned_cache = SimpleNamespace(name="cache")
    monkeypatch.setattr(dependencies, "get_presigned_cache_service", lambda: presigned_cache)

    generator = dependencies.get_presigned_cache()

    assert await anext(generator) is presigned_cache
    with pytest.raises(StopAsyncIteration):
        await anext(generator)
