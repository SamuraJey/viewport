import base64
import hashlib
from collections.abc import Iterable

from redis.asyncio import Redis

PRESIGNED_CACHE_PREFIX = "presign"
PRESIGNED_CACHE_BUFFER_SECONDS = 600
PRESIGNED_INDEX_SUFFIX = "idx"


def _coerce_redis_text(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    if isinstance(value, str):
        return value
    return str(value)


def _encode_object_key(object_key: str) -> str:
    encoded = base64.urlsafe_b64encode(object_key.encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def _disposition_hash(response_content_disposition: str | None) -> str:
    if not response_content_disposition:
        return "none"
    return hashlib.sha256(response_content_disposition.encode("utf-8")).hexdigest()[:32]


def build_presigned_cache_key_prefix(bucket: str, object_key: str) -> str:
    encoded_key = _encode_object_key(object_key)
    return f"{PRESIGNED_CACHE_PREFIX}:{bucket}:{encoded_key}"


def build_presigned_index_key(bucket: str, object_key: str) -> str:
    return f"{build_presigned_cache_key_prefix(bucket, object_key)}:{PRESIGNED_INDEX_SUFFIX}"


def build_presigned_cache_key(
    bucket: str,
    object_key: str,
    response_content_disposition: str | None = None,
) -> str:
    disposition = _disposition_hash(response_content_disposition)
    return f"{build_presigned_cache_key_prefix(bucket, object_key)}:{disposition}"


def _effective_cache_ttl(expires_in: int) -> int:
    return max(1, expires_in - PRESIGNED_CACHE_BUFFER_SECONDS)


def _index_key_from_cache_key(cache_key: str) -> str:
    prefix, _, _ = cache_key.rpartition(":")
    if not prefix:
        return f"{cache_key}:{PRESIGNED_INDEX_SUFFIX}"
    return f"{prefix}:{PRESIGNED_INDEX_SUFFIX}"


async def cache_presigned_url(redis_client: Redis | None, cache_key: str, url: str, expires_in: int) -> None:
    if redis_client is None:
        return

    ttl = _effective_cache_ttl(expires_in)
    index_key = _index_key_from_cache_key(cache_key)

    async with redis_client.pipeline(transaction=False) as pipeline:
        pipeline.set(cache_key, url, ex=ttl)
        pipeline.sadd(index_key, cache_key)
        pipeline.expire(index_key, ttl)
        await pipeline.execute()


async def cache_presigned_urls_batch(
    redis_client: Redis | None,
    key_value_pairs: list[tuple[str, str]],
    expires_in: int,
) -> None:
    if redis_client is None or not key_value_pairs:
        return

    ttl = _effective_cache_ttl(expires_in)
    async with redis_client.pipeline(transaction=False) as pipeline:
        for cache_key, url in key_value_pairs:
            pipeline.set(cache_key, url, ex=ttl)
            index_key = _index_key_from_cache_key(cache_key)
            pipeline.sadd(index_key, cache_key)
            pipeline.expire(index_key, ttl)
        await pipeline.execute()


async def get_cached_presigned_url(redis_client: Redis | None, cache_key: str) -> str | None:
    if redis_client is None:
        return None
    value = await redis_client.get(cache_key)
    return _coerce_redis_text(value)


async def get_cached_presigned_urls_batch(redis_client: Redis | None, cache_keys: list[str]) -> dict[str, str]:
    if redis_client is None or not cache_keys:
        return {}

    values = await redis_client.mget(cache_keys)
    result: dict[str, str] = {}
    for cache_key, value in zip(cache_keys, values, strict=False):
        decoded_value = _coerce_redis_text(value)
        if decoded_value is not None:
            result[cache_key] = decoded_value
    return result


async def clear_presigned_url_cache(redis_client: Redis | None, cache_key: str) -> None:
    if redis_client is None:
        return
    index_key = _index_key_from_cache_key(cache_key)
    async with redis_client.pipeline(transaction=False) as pipeline:
        pipeline.delete(cache_key)
        pipeline.srem(index_key, cache_key)
        await pipeline.execute()


async def clear_presigned_urls_batch(redis_client: Redis | None, cache_keys: list[str]) -> None:
    if redis_client is None or not cache_keys:
        return
    async with redis_client.pipeline(transaction=False) as pipeline:
        pipeline.delete(*cache_keys)
        for cache_key in cache_keys:
            pipeline.srem(_index_key_from_cache_key(cache_key), cache_key)
        await pipeline.execute()


async def clear_presigned_urls_for_object_keys(
    redis_client: Redis | None,
    bucket: str,
    object_keys: Iterable[str],
) -> None:
    if redis_client is None:
        return

    deduplicated_object_keys = {object_key for object_key in object_keys if object_key}
    if not deduplicated_object_keys:
        return

    index_keys = [build_presigned_index_key(bucket, object_key) for object_key in deduplicated_object_keys]
    cached_members = await redis_client.sunion(*index_keys)

    keys_to_delete: set[str] = set(index_keys)
    if cached_members:
        for key in cached_members:
            decoded_key = _coerce_redis_text(key)
            if decoded_key is not None:
                keys_to_delete.add(decoded_key)
    if keys_to_delete:
        await redis_client.delete(*list(keys_to_delete))
