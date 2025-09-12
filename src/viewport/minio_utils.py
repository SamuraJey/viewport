import logging
from functools import cache

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
    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)
    s3_client.upload_fileobj(fileobj, bucket, filename)
    return f"/{bucket}/{filename}"


def get_file_url(filename, time: int = 3600):
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    return s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": filename}, ExpiresIn=time)


def generate_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for direct S3 access to an object"""
    from src.viewport.cache_utils import cache_presigned_url, get_cached_presigned_url

    # Check cache first
    cached_url = get_cached_presigned_url(object_key)
    if cached_url:
        return cached_url

    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()

    try:
        url = s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": object_key}, ExpiresIn=expires_in)

        # Cache the URL
        cache_presigned_url(object_key, url, expires_in)

        return url
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {object_key}: {e}")
        raise
