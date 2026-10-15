import io
import zipfile
from uuid import UUID, uuid4

from PIL import Image
from sqlalchemy.orm import Session

from viewport.models.gallery import Photo, PhotoUploadStatus
from viewport.s3_utils import get_s3_client, get_s3_settings


def seed_download_scope(sync_engine, gallery_id: str) -> dict:
    """Persist known download sizes and distinct real image objects in shared fixtures."""
    prefix = f"{gallery_id}/{uuid4().hex}"
    ids = {name: uuid4() for name in ("first", "second", "video", "unfinished")}
    payloads = {}
    for name, image_format, color, size in (
        ("first.jpg", "JPEG", "red", (12, 8)),
        ("rotated.jpg", "JPEG", "blue", (8, 12)),
        ("first_publication.jpg", "JPEG", "green", (4, 6)),
        ("second.png", "PNG", "white", (10, 8)),
        ("second_publication.jpg", "JPEG", "yellow", (5, 4)),
    ):
        buffer = io.BytesIO()
        Image.new("RGB", size, color).save(buffer, format=image_format)
        payloads[f"{prefix}/{name}"] = buffer.getvalue()
    payloads[f"{prefix}/clip.mp4"] = b"original-video-bytes"
    s3 = get_s3_client()
    bucket = get_s3_settings().bucket
    for key, value in payloads.items():
        s3.put_object(Bucket=bucket, Key=key, Body=value)
    with Session(sync_engine) as db:
        db.add_all([
            Photo(id=ids["first"], gallery_id=UUID(gallery_id), object_key=f"{prefix}/first.jpg", thumbnail_object_key=f"{prefix}/first_thumbnail.avif", rotated_object_key=f"{prefix}/rotated.jpg", rotation=90, requested_rotation=90, rotation_revision=1, display_name="same.jpg", file_size=6_000_000, publication_object_key=f"{prefix}/first_publication.jpg", publication_file_size=400_000, status=PhotoUploadStatus.SUCCESSFUL),
            Photo(id=ids["second"], gallery_id=UUID(gallery_id), object_key=f"{prefix}/second.png", thumbnail_object_key=f"{prefix}/second_thumbnail.avif", display_name="same.png", file_size=4_000_000, publication_object_key=f"{prefix}/second_publication.jpg", publication_file_size=300_000, status=PhotoUploadStatus.SUCCESSFUL),
            Photo(id=ids["video"], gallery_id=UUID(gallery_id), object_key=f"{prefix}/clip.mp4", thumbnail_object_key=f"{prefix}/clip_thumbnail.avif", playback_object_key=f"{prefix}/clip.mp4", display_name="clip.mp4", file_size=20_000_000, media_type="video", status=PhotoUploadStatus.SUCCESSFUL),
            Photo(id=ids["unfinished"], gallery_id=UUID(gallery_id), object_key=f"{prefix}/unfinished.jpg", thumbnail_object_key=f"{prefix}/unfinished_thumbnail.avif", display_name="unfinished.jpg", file_size=90_000_000, status=PhotoUploadStatus.PROCESSING),
        ])
        db.commit()
    return {"ids": ids, "prefix": prefix, "payloads": payloads}


def unpack_download(response) -> dict[str, bytes]:
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}
