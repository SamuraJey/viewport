import os

import boto3
from botocore.client import Config

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "photos")

s3_client = boto3.client(
    "s3", endpoint_url=f"http://{MINIO_ENDPOINT}", aws_access_key_id=MINIO_ACCESS_KEY, aws_secret_access_key=MINIO_SECRET_KEY, config=Config(signature_version="s3v4"), region_name="us-east-1"
)


def ensure_bucket_exists():
    buckets = s3_client.list_buckets()["Buckets"]
    if not any(b["Name"] == MINIO_BUCKET for b in buckets):
        s3_client.create_bucket(Bucket=MINIO_BUCKET)


def upload_fileobj(fileobj, filename):
    ensure_bucket_exists()
    import io

    if isinstance(fileobj, bytes):
        fileobj = io.BytesIO(fileobj)
    s3_client.upload_fileobj(fileobj, MINIO_BUCKET, filename)
    return f"/{MINIO_BUCKET}/{filename}"


def get_file_url(filename):
    return s3_client.generate_presigned_url("get_object", Params={"Bucket": MINIO_BUCKET, "Key": filename}, ExpiresIn=3600)
