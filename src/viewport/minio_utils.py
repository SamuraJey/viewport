import logging
from functools import cache
from typing import cast

import boto3
from botocore.client import BaseClient, Config
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    return boto3.client("s3", endpoint_url=f"http://{endpoint}", aws_access_key_id=access_key, aws_secret_access_key=secret_key, config=Config(signature_version="s3v4"), region_name="eu-west-1")


def ensure_bucket_exists():
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    buckets = s3_client.list_buckets()["Buckets"]
    if not any(b["Name"] == bucket for b in buckets):
        s3_client.create_bucket(Bucket=bucket)


def upload_fileobj(fileobj, filename):
    ensure_bucket_exists()
    import io

    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    # Allow passing additional metadata via (fileobj, metadata_dict)
    # Support signature: upload_fileobj(fileobj, filename) or upload_fileobj((fileobj, metadata_dict), filename)
    metadata = None
    if isinstance(fileobj, tuple) and len(fileobj) == 2:
        fileobj, metadata = fileobj

    # Normalize raw bytes into a file-like object implementing read()
    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)
    if metadata:
        s3_client.upload_fileobj(fileobj, bucket, filename, ExtraArgs={"Metadata": metadata})
    else:
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
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {object_key}: {e}")
        raise


def get_object_metadata(object_key: str) -> dict:
    """Return object metadata for a given object key. Returns a dict with keys from S3 HeadObject response.

    Example returns: {'ContentLength': 12345, 'Metadata': {'width': '1024', 'height': '768'}}
    """
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    try:
        resp = s3_client.head_object(Bucket=bucket, Key=object_key)
        return cast(dict, resp)
    except Exception as e:
        logger.debug(f"Failed to get metadata for {object_key}: {e}")
        return {}


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

    from PIL import Image

    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to RGB if necessary (for JPEG compatibility)
        if image.mode in ("RGBA", "P"):
            new_image = image.convert("RGB")

        # Create thumbnail maintaining aspect ratio
        new_image.thumbnail(max_size, Image.Resampling.LANCZOS)

        # Save thumbnail to bytes
        thumbnail_io = io.BytesIO()
        new_image.save(thumbnail_io, format="JPEG", quality=quality, optimize=True)
        thumbnail_io.seek(0)

        return thumbnail_io.read()
    except Exception as e:
        logger.error(f"Failed to create thumbnail: {e}")
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
