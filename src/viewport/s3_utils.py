import io
import logging
from functools import lru_cache
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config
from PIL import Image, ImageOps
from pydantic_settings import BaseSettings, SettingsConfigDict

# Configure logging - set botocore to WARNING level to reduce noise
logging.getLogger("botocore").setLevel(logging.INFO)
logging.getLogger("boto3").setLevel(logging.INFO)
logging.getLogger("urllib3").setLevel(logging.INFO)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


@lru_cache(maxsize=1)
def get_s3_settings() -> "S3Settings":
    """Get cached S3 settings."""
    return S3Settings()


class S3Settings(BaseSettings):
    """Configuration for the S3 client"""

    endpoint: str = "localhost:9000"
    access_key: str = "rustfsadmin"
    secret_key: str = "rustfsadmin"
    bucket: str = "viewport"
    region: str = "us-east-1"
    use_ssl: bool = False
    signature_version: str = "s3v4"

    model_config = SettingsConfigDict(
        env_prefix="S3_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_s3_client() -> "S3Client":
    """Get a boto3 S3 client configured for the current environment (sync client).

    Used for operations that don't need async, like thumbnail uploads in Celery tasks.
    The result is cached to avoid recreating the client and connection pool.
    """
    settings = get_s3_settings()

    # Add protocol if not present
    endpoint = settings.endpoint
    if not endpoint.startswith(("http://", "https://")):
        protocol = "https" if settings.use_ssl else "http"
        endpoint = f"{protocol}://{endpoint}"

    logger.info("Creating sync S3 client for endpoint: %s", endpoint)

    # Increase max pool connections to support concurrent uploads
    config = Config(
        signature_version=settings.signature_version,
        max_pool_connections=200,  # Increased to handle concurrent batch uploads
        retries={"max_attempts": 3, "mode": "standard"},
        connect_timeout=10,
        read_timeout=60,
        s3={"addressing_style": "path"},
    )

    logger.info(
        "S3 Client settings: %s",
        settings.model_dump(
            exclude=(
                "secret_key",
                "access_key",
            )
        ),
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.region,
        aws_access_key_id=settings.access_key,
        aws_secret_access_key=settings.secret_key,
        config=config,
    )


def upload_fileobj(fileobj: bytes | io.BytesIO, filename: str, content_type: str | None = None) -> str:
    """Upload file object to S3 (sync version for Celery tasks).

    Args:
        fileobj: File-like object or bytes to upload
        filename: S3 object key
        content_type: Optional Content-Type header (e.g., 'image/jpeg')

    Returns:
        S3 object path
    """
    settings = get_s3_settings()
    s3_client = get_s3_client()

    # Normalize raw bytes into a file-like object implementing read()
    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)

    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    s3_client.upload_fileobj(fileobj, settings.bucket, filename, ExtraArgs=extra_args if extra_args else None)
    return f"/{settings.bucket}/{filename}"


def create_thumbnail(image_bytes: bytes, max_size: tuple[int, int] = (800, 800), quality: int = 80) -> tuple[bytes, int, int]:
    """Create a thumbnail from image bytes (CPU-bound, can be run in thread pool).

    Optimized for performance and memory usage by using JPEG draft mode
    and avoiding unnecessary full-resolution rotations.

    Args:
        image_bytes: Original image as bytes
        max_size: Maximum dimensions (width, height) for thumbnail
        quality: JPEG quality (1-95, higher is better quality)

    Returns:
        Tuple of (thumbnail_bytes, width, height)
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            # JPEG optimization: hint the decoder about target size to save CPU/RAM.
            # This reconfigures the decoder to return a scaled-down version
            # directly if supported (JPEG/MPO).
            if img.format == "JPEG":
                img.draft("RGB", max_size)

            # Apply EXIF orientation. Done after draft() hint to rotate fewer pixels
            # if the decoder already downscaled, but before thumbnail() to ensure
            # correct final aspect ratio.
            img = ImageOps.exif_transpose(img)

            # Ensure we're in RGB mode (e.g., if original was CMYK or P)
            if img.mode != "RGB":
                img = img.convert("RGB")

            # High-quality downsampling. LANCZOS is the best quality filter.
            img.thumbnail(max_size, Image.Resampling.LANCZOS)

            width, height = img.size

            thumbnail_io = io.BytesIO()
            # optimize=True: extra pass for Huffman tables.
            # progressive=True: better for web display and often smaller files.
            img.save(
                thumbnail_io,
                format="JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
            )
            return thumbnail_io.getvalue(), width, height
    except Exception as e:
        logger.error("Failed to create thumbnail: %s", e)
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
