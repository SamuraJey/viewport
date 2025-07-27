from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import mimetypes

from src.viewport.minio_utils import get_minio_config, get_s3_client

router = APIRouter()


@router.get("/files/{key:path}")
def proxy_file(key: str):
    """Proxy image requests, streaming from MinIO S3"""
    # Retrieve bucket name and S3 client
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()
    try:
        obj = s3_client.get_object(Bucket=bucket, Key=key)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    # Guess MIME type based on file extension; fall back to object ContentType or octet-stream
    mime_type, _ = mimetypes.guess_type(key)
    if not mime_type:
        mime_type = obj.get("ContentType", "application/octet-stream")
    return StreamingResponse(obj["Body"], media_type=mime_type)
