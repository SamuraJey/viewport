import os

import boto3
from botocore.client import Config


def get_minio_config():
    endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket = os.getenv("MINIO_BUCKET", "photos")
    return endpoint, access_key, secret_key, bucket


def get_s3_client():
    endpoint, access_key, secret_key, _ = get_minio_config()
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
