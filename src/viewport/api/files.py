import logging
import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.viewport.minio_utils import get_minio_config, get_s3_client

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{key:path}")
def proxy_file(key: str):
    """Proxy file requests, streaming from MinIO S3"""
    logging.info(f"[proxy_file] Received request for key: {key}")

    # Retrieve bucket name and S3 client
    _, _, _, bucket = get_minio_config()
    s3_client = get_s3_client()

    try:
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        logging.info(f"[proxy_file] Successfully fetched object from S3: bucket={bucket}, key={key}")
    except Exception as e:
        logging.error(f"[proxy_file] Error fetching object: {e}")
        raise HTTPException(status_code=404, detail="File not found") from e

    # Guess MIME type based on file extension; fall back to object ContentType or octet-stream
    mime_type, _ = mimetypes.guess_type(key)
    if not mime_type:
        mime_type = obj.get("ContentType", "application/octet-stream")

    logging.info(f"[proxy_file] Returning StreamingResponse with media_type={mime_type}")
    return StreamingResponse(obj["Body"], media_type=mime_type)
