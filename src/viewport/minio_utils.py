import io
import logging
from typing import TYPE_CHECKING, cast

import boto3
from botocore.client import Config
from PIL import Image, ImageOps
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Configure logging - set botocore to WARNING level to reduce noise
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class S3Settings(BaseSettings):
    """Configuration for S3/MinIO client"""

    endpoint: str = "localhost:9000"
    access_key: str = Field(alias="MINIO_ROOT_USER", default="minioadmin")
    secret_key: str = Field(alias="MINIO_ROOT_PASSWORD", default="minioadmin")
    bucket: str = "viewport"
    region: str = "us-east-1"  # Can be overridden with MINIO_REGION env var
    use_ssl: bool = False  # Can be overridden with MINIO_USE_SSL env var
    signature_version: str = "s3v4"

    model_config = SettingsConfigDict(
        env_prefix="S3_",
        env_file=".env",
        extra="ignore",
    )


def get_s3_client() -> "S3Client":
    """Get a boto3 S3 client configured for MinIO (sync client).

    Used for operations that don't need async, like thumbnail uploads in Celery tasks.
    """
    settings = S3Settings()

    # Add protocol if not present
    endpoint = settings.endpoint
    if not endpoint.startswith(("http://", "https://")):
        protocol = "https" if settings.use_ssl else "http"
        endpoint = f"{protocol}://{endpoint}"

    logger.info(f"Creating sync S3 client for endpoint: {endpoint}")

    # Increase max pool connections to support concurrent uploads
    config = Config(
        signature_version=settings.signature_version,
        max_pool_connections=50,
        s3={"addressing_style": "path"},
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.access_key,
        aws_secret_access_key=settings.secret_key,
        config=config,
    )


def upload_fileobj(fileobj: bytes | io.BytesIO, filename: str, content_type: str | None = None) -> str:
    """Upload file object to MinIO/S3 (sync version for Celery tasks).

    Args:
        fileobj: File-like object or bytes to upload
        filename: S3 object key
        content_type: Optional Content-Type header (e.g., 'image/jpeg')

    Returns:
        S3 object path
    """
    settings = S3Settings()
    s3_client = get_s3_client()

    # Normalize raw bytes into a file-like object implementing read()
    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)

    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    s3_client.upload_fileobj(fileobj, settings.bucket, filename, ExtraArgs=extra_args if extra_args else None)
    return f"/{settings.bucket}/{filename}"


def create_thumbnail(image_bytes: bytes, max_size: tuple[int, int] = (800, 800), quality: int = 85) -> tuple[bytes, int, int]:
    """Create a thumbnail from image bytes (CPU-bound, can be run in thread pool).

    Args:
        image_bytes: Original image as bytes
        max_size: Maximum dimensions (width, height) for thumbnail
        quality: JPEG quality (1-95, higher is better quality)

    Returns:
        Tuple of (thumbnail_bytes, width, height)
    """
    try:
        image = cast(Image.Image, Image.open(io.BytesIO(image_bytes)))
        # Apply EXIF orientation to fix rotation issues
        image = ImageOps.exif_transpose(image) or image
        image = image.convert("RGB")
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        thumbnail_io = io.BytesIO()
        image.save(thumbnail_io, format="JPEG", quality=quality, optimize=True)
        image.close()
        thumbnail_io.seek(0)

        return thumbnail_io.read(), image.width, image.height
    except Exception as e:
        logger.error(f"Failed to create thumbnail: {e}")
        raise


def generate_thumbnail_object_key(original_object_key: str) -> str:
    """Generate thumbnail object key from original object key.

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
