import io
import logging
import os
import tempfile
from functools import lru_cache
from typing import TYPE_CHECKING, Any

import boto3
from botocore.client import Config
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

    # A prefork child processes one task at a time. Keep enough connections for
    # boto3 transfer helpers without allocating a pool sized for cross-process
    # concurrency (each process owns its own client/pool).
    config = Config(
        signature_version=settings.signature_version,
        max_pool_connections=10,
        retries={"max_attempts": 3, "mode": "standard"},
        connect_timeout=10,
        read_timeout=60,
        s3={"addressing_style": "path"},
    )

    logger.info(
        "S3 Client settings: %s",
        settings.model_dump(
            exclude={
                "secret_key",
                "access_key",
            }
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


def upload_fileobj(
    fileobj: bytes | io.BytesIO,
    filename: str,
    content_type: str | None = None,
    cache_control: str | None = None,
) -> str:
    """Upload file object to S3 (sync version for Celery tasks).

    Args:
        fileobj: File-like object or bytes to upload
        filename: S3 object key
        content_type: Optional Content-Type header (e.g., 'image/avif')
        cache_control: Optional Cache-Control header (e.g., 'public, max-age=31536000, immutable')

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
    if cache_control:
        extra_args["CacheControl"] = cache_control

    s3_client.upload_fileobj(fileobj, settings.bucket, filename, ExtraArgs=extra_args if extra_args else None)
    return f"/{settings.bucket}/{filename}"


@lru_cache(maxsize=1)
def _get_pyvips() -> Any:
    """Import and configure pyvips lazily in the process that does image work."""

    # Four Celery prefork children already provide process-level parallelism.
    # Avoid a second layer of libvips threads per image unless explicitly tuned.
    os.environ.setdefault("VIPS_CONCURRENCY", "1")

    import pyvips

    # Long-lived workers do not benefit from caching one-shot thumbnail graphs;
    # disabling it prevents native operation graphs from raising idle RSS.
    pyvips.cache_set_max(0)
    return pyvips


def create_thumbnail_from_path(
    image_path: str | os.PathLike[str],
    max_size: tuple[int, int] = (1000, 1000),
    quality: int = 70,
) -> tuple[bytes, int, int]:
    """Create an autorotated AVIF thumbnail through libvips' streaming pipeline.

    Always uses ``pyvips.Image.thumbnail`` for shrink-on-load + auto-orient,
    then strips alpha after resize when present — the previous per-branch
    approach (``new_from_file`` + ``extract_band`` + ``thumbnail_image`` for
    alpha images) discarded both optimisations.
    """

    pyvips = _get_pyvips()
    try:
        path = os.fspath(image_path)
        image = pyvips.Image.thumbnail(
            path,
            max_size[0],
            height=max_size[1],
            size="down",
            fail_on="error",
        )
        if image.hasalpha():
            # Strip alpha after resize so orientation + shrink-on-load
            # are preserved.
            image = image.extract_band(0, n=image.bands - 1)
        if image.interpretation != "srgb":
            image = image.colourspace("srgb")

        width, height = image.width, image.height
        thumbnail_bytes = image.heifsave_buffer(
            Q=quality,
            compression="av1",
            effort=2,
            subsample_mode="on",
            keep=8,  # ForeignKeep.ICC; strip EXIF/XMP/IPTC from public derivatives.
        )
        return bytes(thumbnail_bytes), width, height
    except Exception as error:
        logger.error("Failed to create thumbnail: %s", error)
        raise


def create_thumbnail(
    image_bytes: bytes,
    max_size: tuple[int, int] = (1000, 1000),
    quality: int = 70,
) -> tuple[bytes, int, int]:
    """Compatibility wrapper for callers, such as video poster extraction, that hold bytes."""

    with tempfile.TemporaryFile() as image_file:
        image_file.write(image_bytes)
        image_file.flush()
        image_file.seek(0)
        return create_thumbnail_from_path(f"/proc/self/fd/{image_file.fileno()}", max_size=max_size, quality=quality)


def generate_thumbnail_object_key(original_object_key: str) -> str:
    """Generate thumbnail object key from original object key.

    Converts photo key to `{gallery_id}/{photo_id}_thumbnail.avif` format.
    Serves as both image thumbnail and video poster frame.

    Args:
        original_object_key: Original object key (e.g., 'gallery_id/photo_id.jpg')

    Returns:
        Thumbnail object key in AVIF format (e.g., 'gallery_id/photo_id_thumbnail.avif')
    """
    if "/" in original_object_key:
        gallery_id, filename = original_object_key.split("/", 1)
        photo_id = filename.rsplit(".", 1)[0] if "." in filename else filename
        return f"{gallery_id}/{photo_id}_thumbnail.avif"
    else:
        # Fallback if no gallery_id prefix
        photo_id = original_object_key.rsplit(".", 1)[0] if "." in original_object_key else original_object_key
        return f"{photo_id}_thumbnail.avif"


def generate_playback_object_key(original_object_key: str) -> str:
    """Generate playback object key from original object key.

    Converts video key to `{gallery_id}/{photo_id}_playback.mp4` format.

    Args:
        original_object_key: Original object key (e.g., 'gallery_id/video.mov')

    Returns:
        Playback object key in MP4 format (e.g., 'gallery_id/photo_id_playback.mp4')
    """
    if "/" in original_object_key:
        gallery_id, filename = original_object_key.split("/", 1)
        photo_id = filename.rsplit(".", 1)[0] if "." in filename else filename
        return f"{gallery_id}/{photo_id}_playback.mp4"
    else:
        photo_id = original_object_key.rsplit(".", 1)[0] if "." in original_object_key else original_object_key
        return f"{photo_id}_playback.mp4"


def generate_poster_object_key(original_object_key: str) -> str:
    """Generate poster object key from original object key.

    For v1 the poster is stored at the same key as the thumbnail.

    Args:
        original_object_key: Original object key (e.g., 'gallery_id/photo_id.jpg')

    Returns:
        Poster object key in AVIF format — currently the thumbnail key.
    """
    return generate_thumbnail_object_key(original_object_key)


def get_derivative_object_keys(original_object_key: str) -> dict[str, str]:
    """Return all derivative object keys for the given original object key.

    Args:
        original_object_key: Original object key (e.g., 'gallery_id/photo_id.jpg')

    Returns:
        Dict with keys "thumbnail", "playback", "poster" and their object key values.
    """
    return {
        "thumbnail": generate_thumbnail_object_key(original_object_key),
        "playback": generate_playback_object_key(original_object_key),
        "poster": generate_poster_object_key(original_object_key),
    }
