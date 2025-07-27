from functools import cache
import os

import boto3
from botocore.client import Config

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class MinioSettings(BaseSettings):
    endpoint: str = "localhost:9000"
    access_key: str = Field(alias="ROOT_USER", default="minioadmin")
    secret_key: str = Field(alias="ROOT_PASSWORD", default="minioadmin")
    bucket: str = "viewport"

    model_config = SettingsConfigDict(
        env_prefix="MINIO_",
        env_file=".env", extra="ignore",)  # Ignore extra fields not defined in the model)


@cache
def get_minio_config() -> tuple[str, str, str, str]:
    settings = MinioSettings()
    return settings.endpoint, settings.access_key, settings.secret_key, settings.bucket


@cache
def get_s3_client():
    endpoint, access_key, secret_key, _ = get_minio_config()
    print(f"Connecting to MinIO at {endpoint} with bucket {os.getenv('MINIO_BUCKET', 'photos')}")
    return boto3.client("s3", endpoint_url=f"http://{endpoint}", aws_access_key_id=access_key, aws_secret_access_key=secret_key, config=Config(signature_version="s3v4"), region_name="us-east-1")


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


def get_file_url(filename):
    s3_client = get_s3_client()
    _, _, _, bucket = get_minio_config()
    return s3_client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": filename}, ExpiresIn=3600)
