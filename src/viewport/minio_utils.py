import asyncio
import io
import logging
from functools import cache
from typing import cast

import boto3
from botocore.client import BaseClient, Config
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.viewport.cache_utils import cache_presigned_url, get_cached_presigned_url

# Configure logging - set botocore to WARNING level to reduce noise
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)  # Set our logger to INFO level


class MinioSettings(BaseSettings):
    endpoint: str = "localhost:9000"
    access_key: str = Field(alias="MINIO_ROOT_USER", default="minioadmin")
    secret_key: str = Field(alias="MINIO_ROOT_PASSWORD", default="minioadmin")
    bucket: str = "viewport"

    model_config = SettingsConfigDict(
        env_prefix="MINIO_",
        env_file=".env",
        extra="ignore",
    )  # Ignore extra fields not defined in the model)


@cache
def get_minio_config() -> tuple[str, str, str, str]:
    settings = MinioSettings()
    return settings.endpoint, settings.access_key, settings.secret_key, settings.bucket


@cache
def get_s3_client() -> BaseClient:
    endpoint, access_key, secret_key, bucket = get_minio_config()

    logger.debug(f"Connecting to MinIO at {endpoint} with bucket {bucket}")

    # Increase max pool connections to support concurrent uploads
    # Default is 10, but we need more for parallel batch processing
    config = Config(
        signature_version="s3v4",
        max_pool_connections=50,  # Support up to 50 concurrent connections
    )

    return boto3.client(
        "s3",
        endpoint_url=f"http://{endpoint}",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=config,
        region_name="eu-west-1",
    )


def ensure_bucket_exists(s3_client: BaseClient, bucket: str) -> None:
    buckets = s3_client.list_buckets()["Buckets"]
    if not any(b["Name"] == bucket for b in buckets):
        s3_client.create_bucket(Bucket=bucket)


def upload_fileobj(fileobj, filename):
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    ensure_bucket_exists(s3_client, bucket)

    # Normalize raw bytes into a file-like object implementing read()
    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)

    s3_client.upload_fileobj(fileobj, bucket, filename)
    return f"/{bucket}/{filename}"


def get_file_url(filename, time: int = 3600):
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    return s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": filename}, ExpiresIn=time)


def generate_presigned_url(object_key: str, expires_in: int = 3600) -> str:  # TODO maybe change to url
    """Generate a presigned URL for direct S3 access to an object"""
    from src.viewport.cache_utils import cache_presigned_url, get_cached_presigned_url

    cached_url = get_cached_presigned_url(object_key)
    if cached_url:
        return cached_url

    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()

    try:
        url = s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": object_key}, ExpiresIn=expires_in)

        cache_presigned_url(object_key, url, expires_in)

        return cast(str, url)
    except Exception as e:  # pragma: no cover
        logger.error(f"Failed to generate presigned URL for {object_key}: {e}")
        raise


async def async_generate_presigned_urls_batch(object_keys: list[str], expires_in: int = 3600) -> dict[str, str]:
    """Generate presigned URLs for multiple objects concurrently

    Args:
        object_keys: List of S3 object keys
        expires_in: URL expiration time in seconds

    Returns:
        Dict mapping object_key to presigned URL
    """

    # Check cache first
    result = {}
    uncached_keys = []

    for object_key in object_keys:
        cached_url = get_cached_presigned_url(object_key)
        if cached_url:
            result[object_key] = cached_url
        else:
            uncached_keys.append(object_key)

    # If all URLs are cached, return immediately
    if not uncached_keys:
        return result

    # Generate presigned URLs for uncached keys concurrently
    executor = _get_executor()
    loop = asyncio.get_event_loop()

    def _generate_url(object_key: str) -> tuple[str, str]:
        """Generate single presigned URL (runs in thread pool)"""
        s3_client = get_s3_client()
        _, _, _, bucket = get_minio_config()
        url = s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": object_key}, ExpiresIn=expires_in)
        cache_presigned_url(object_key, url, expires_in)
        return object_key, cast(str, url)

    # Generate URLs concurrently
    tasks = [loop.run_in_executor(executor, _generate_url, key) for key in uncached_keys]
    generated = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results
    for item in generated:
        if isinstance(item, Exception):  # pragma: no cover
            logger.error(f"Failed to generate presigned URL: {item}")
            continue
        object_key, url = item
        result[object_key] = url

    return result


def rename_object(old_object_key: str, new_object_key: str) -> bool:
    """Rename an object in MinIO by copying it to a new key and deleting the old one"""
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()

    try:
        copy_source = {"Bucket": bucket, "Key": old_object_key}
        s3_client.copy_object(CopySource=copy_source, Bucket=bucket, Key=new_object_key)

        s3_client.delete_object(Bucket=bucket, Key=old_object_key)

        logger.info(f"Successfully renamed object from {old_object_key} to {new_object_key}")
        return True
    except Exception as e:
        logger.error(f"Failed to rename object from {old_object_key} to {new_object_key}: {e}")
        return False


def delete_object(object_key: str) -> bool:
    """Delete an object from MinIO"""
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()

    try:
        s3_client.delete_object(Bucket=bucket, Key=object_key)
        logger.info(f"Successfully deleted object {object_key}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete object {object_key}: {e}")
        return False


def delete_folder(prefix: str) -> bool:
    """Delete all objects with a given prefix (folder) from MinIO

    Args:
        prefix: The folder prefix to delete (e.g., 'gallery_id/')

    Returns:
        True if deletion was successful, False otherwise
    """
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()

    try:
        # List all objects with the given prefix
        paginator = s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

        objects_to_delete = []
        for page in pages:
            if "Contents" in page:
                objects_to_delete.extend([{"Key": obj["Key"]} for obj in page["Contents"]])

        # Delete all objects if any were found
        if objects_to_delete:
            # S3 delete_objects can handle up to 1000 objects at a time
            for i in range(0, len(objects_to_delete), 1000):
                batch = objects_to_delete[i : i + 1000]
                s3_client.delete_objects(Bucket=bucket, Delete={"Objects": batch})

            logger.info(f"Successfully deleted {len(objects_to_delete)} objects with prefix {prefix}")
        else:
            logger.info(f"No objects found with prefix {prefix}")

        return True
    except Exception as e:
        logger.error(f"Failed to delete folder with prefix {prefix}: {e}")
        return False


def create_thumbnail(image_bytes: bytes, max_size: tuple[int, int] = (800, 800), quality: int = 85) -> bytes:
    """Create a thumbnail from image bytes

    Args:
        image_bytes: Original image as bytes
        max_size: Maximum dimensions (width, height) for thumbnail
        quality: JPEG quality (1-95, higher is better quality)

    Returns:
        Thumbnail image as bytes
    """
    import io

    from PIL import Image, ImageOps

    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))

        # Apply EXIF orientation to fix rotation issues
        image = ImageOps.exif_transpose(image) or image

        # Convert to RGB if necessary (for JPEG compatibility)
        image = image.convert("RGB")

        # Create thumbnail maintaining aspect ratio
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        # Save thumbnail to bytes
        thumbnail_io = io.BytesIO()
        image.save(thumbnail_io, format="JPEG", quality=quality, optimize=True)
        image.close()
        thumbnail_io.seek(0)

        return thumbnail_io.read()
    except Exception as e:
        logger.error(f"Failed to create thumbnail: {e}")
        raise


def process_image_and_create_thumbnail(
    image_bytes: bytes,
    max_size: tuple[int, int] = (800, 800),
    quality: int = 85,
) -> tuple[bytes, int | None, int | None]:
    """Process image: extract dimensions and create thumbnail in one pass

    Args:
        image_bytes: Original image bytes
        max_size: Maximum thumbnail dimensions
        quality: JPEG quality

    Returns:
        Tuple of (thumbnail_bytes, width, height)
    """
    import io

    from PIL import Image, ImageOps

    try:
        # Open image once
        image = Image.open(io.BytesIO(image_bytes))

        # Apply EXIF orientation
        image = ImageOps.exif_transpose(image) or image

        # Get dimensions
        width, height = image.size

        # Convert to RGB
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Create thumbnail (modifies image in-place)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        # Save thumbnail
        thumbnail_io = io.BytesIO()
        image.save(thumbnail_io, format="JPEG", quality=quality, optimize=True)
        image.close()
        thumbnail_io.seek(0)

        return thumbnail_io.read(), width, height
    except Exception as e:
        logger.error(f"Failed to process image: {e}")
        raise


def generate_thumbnail_object_key(original_object_key: str) -> str:
    """Generate thumbnail object key from original object key

    Args:
        original_object_key: Original object key (e.g., 'gallery_id/filename.jpg')

    Returns:
        Thumbnail object key (e.g., 'gallery_id/thumbnails/filename.jpg')
    """
    if "/" in original_object_key:
        gallery_id, filename = original_object_key.split("/", 1)
        return f"{gallery_id}/thumbnails/{filename}"
    else:
        # Fallback if no gallery_id prefix
        return f"thumbnails/{original_object_key}"


# ============================================================================
# Async functions for concurrent operations using aioboto3
# ============================================================================

# Global lock for bucket creation
_bucket_creation_lock = None
_bucket_ensured = False

# Shared thread pool for CPU-bound operations
_executor = None


def _get_executor():
    """Get or create a shared thread pool executor"""
    import os
    from concurrent.futures import ThreadPoolExecutor

    global _executor
    if _executor is None:
        # Use number of CPUs for optimal parallelism
        max_workers = min(32, (os.cpu_count() or 1) * 2)
        _executor = ThreadPoolExecutor(max_workers=max_workers)
    return _executor


def _get_bucket_lock():
    """Get or create the bucket creation lock"""
    global _bucket_creation_lock
    if _bucket_creation_lock is None:
        import asyncio

        _bucket_creation_lock = asyncio.Lock()
    return _bucket_creation_lock


async def async_ensure_bucket_exists():
    """Async version of ensure_bucket_exists using sync boto3 (faster)"""
    import asyncio

    global _bucket_ensured

    # Fast path: if bucket already ensured, return immediately
    if _bucket_ensured:
        return

    # Acquire lock to prevent concurrent bucket creation attempts
    lock = _get_bucket_lock()
    async with lock:
        # Double-check after acquiring lock
        if _bucket_ensured:
            return

        # Use sync boto3 in executor
        executor = _get_executor()
        loop = asyncio.get_event_loop()

        def _sync_ensure_bucket():
            global _bucket_ensured
            s3_client = get_s3_client()
            _, _, _, bucket = get_minio_config()

            try:
                buckets_response = s3_client.list_buckets()
                buckets = buckets_response.get("Buckets", [])
                if not any(b["Name"] == bucket for b in buckets):
                    s3_client.create_bucket(Bucket=bucket)
                    logger.info(f"Created bucket: {bucket}")
                _bucket_ensured = True
            except Exception as e:
                logger.error(f"Failed to ensure bucket exists: {e}")
                raise

        await loop.run_in_executor(executor, _sync_ensure_bucket)


async def async_upload_fileobj(fileobj, filename: str, metadata: dict | None = None):
    """Async version of upload_fileobj using sync boto3 in executor (faster than aioboto3)

    Args:
        fileobj: File-like object or bytes to upload
        filename: S3 object key
        metadata: Optional metadata dict to attach to the object

    Returns:
        S3 object path
    """
    import asyncio
    import io

    # Ensure bucket exists (cached after first call)
    await async_ensure_bucket_exists()

    # Use sync boto3 in executor - it's faster than aioboto3 for small files
    executor = _get_executor()
    loop = asyncio.get_event_loop()

    def _sync_upload():
        s3_client = get_s3_client()
        _, _, _, bucket = get_minio_config()

        # Normalize raw bytes into a file-like object
        file_to_upload = fileobj
        if isinstance(fileobj, bytes):
            file_to_upload = io.BytesIO(fileobj)

        extra_args = {}
        if metadata:
            extra_args["Metadata"] = metadata

        s3_client.upload_fileobj(file_to_upload, bucket, filename, ExtraArgs=extra_args if extra_args else None)
        return f"/{bucket}/{filename}"

    return await loop.run_in_executor(executor, _sync_upload)


async def async_create_and_upload_thumbnail(
    image_bytes: bytes,
    object_key: str,
    max_size: tuple[int, int] = (800, 800),
    quality: int = 85,
) -> tuple[str, int | None, int | None]:
    """Process image and upload thumbnail asynchronously

    Args:
        image_bytes: Original image bytes
        object_key: Original object key
        max_size: Maximum thumbnail dimensions
        quality: JPEG quality

    Returns:
        Tuple of (thumbnail_object_key, width, height)
    """
    import asyncio

    # Process image and create thumbnail in shared thread pool
    executor = _get_executor()
    loop = asyncio.get_event_loop()

    thumbnail_bytes, width, height = await loop.run_in_executor(
        executor,
        process_image_and_create_thumbnail,
        image_bytes,
        max_size,
        quality,
    )

    # Upload thumbnail asynchronously
    thumbnail_object_key = generate_thumbnail_object_key(object_key)
    await async_upload_fileobj(thumbnail_bytes, thumbnail_object_key)

    return thumbnail_object_key, width, height


async def async_process_and_upload_image(
    image_bytes: bytes,
    object_key: str,
    extract_dimensions: bool = True,
) -> tuple[str, str, int | None, int | None]:
    """Process image, create thumbnail, and upload both concurrently

    Args:
        image_bytes: Image bytes to process
        object_key: S3 object key for the original image
        extract_dimensions: Whether to extract image dimensions (always True for optimization)

    Returns:
        Tuple of (object_key, thumbnail_object_key, width, height)
    """
    import asyncio

    # Process image and create thumbnail (gets dimensions as side effect)
    # Upload original and thumbnail concurrently
    # Use return_exceptions to handle thumbnail errors gracefully
    results = await asyncio.gather(
        async_upload_fileobj(image_bytes, object_key, None),
        async_create_and_upload_thumbnail(image_bytes, object_key),
        return_exceptions=True,
    )

    # Check results
    original_result, thumbnail_result = results

    # If original upload failed, raise the exception
    if isinstance(original_result, Exception):
        logger.error(f"Failed to upload original for {object_key}: {original_result}")
        raise original_result

    # If thumbnail creation failed, use original as thumbnail
    if isinstance(thumbnail_result, Exception):
        logger.warning(f"Thumbnail creation failed for {object_key}, using original as thumbnail")
        thumbnail_object_key = object_key
        width, height = None, None
    else:
        thumbnail_object_key, width, height = thumbnail_result

    return object_key, thumbnail_object_key, width, height
