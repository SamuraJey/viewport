"""Versioned, non-destructive photo edits on the existing photo worker queue."""

import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select, update

from viewport.background_tasks import _stream_s3_object_to_tempfile
from viewport.celery_app import celery_app
from viewport.models.gallery import Gallery, Photo
from viewport.models.project import Project
from viewport.photo_rotation import compose_exif_rotation, rotate_focal_point
from viewport.s3_utils import _get_pyvips, create_thumbnail_from_path, get_s3_client, get_s3_settings
from viewport.task_utils import task_db_session

logger = logging.getLogger(__name__)


def create_rotated_file(source: str, output: str, content_type: str, rotation: int) -> None:
    if content_type in ("image/jpeg", "image/jpg"):
        # The source is an anonymous parent-process tempfile. ExifTool is a child.
        exif_source = source.replace("/proc/self/", f"/proc/{os.getpid()}/")
        info = subprocess.run(["exiftool", "-j", "-n", "-IFD0:Orientation", exif_source], capture_output=True, check=True, timeout=60)
        orientation = json.loads(info.stdout)[0].get("Orientation", 1)
        composed = compose_exif_rotation(int(orientation), rotation)
        # ExifTool cannot write directly from an extensionless /proc descriptor.
        # Copy on disk, then edit metadata in place; compressed pixels stay intact.
        shutil.copyfile(source, output)
        subprocess.run(
            ["exiftool", "-overwrite_original", "-n", f"-IFD0:Orientation={composed}", f"-XMP-tiff:Orientation={composed}", "-ThumbnailImage=", output],
            capture_output=True,
            check=True,
            timeout=60,
        )
    elif content_type == "image/png":
        image = _get_pyvips().Image.new_from_file(source, access="sequential", fail_on="error").autorot()
        if rotation:
            image = image.rot({90: "d90", 180: "d180", 270: "d270"}[rotation])
        image.pngsave(output, compression=6, keep="all")
    else:
        raise ValueError("Only JPEG and PNG images can be rotated")


def _publish_rotation(photo_id: uuid.UUID, revision: int, key: str | None, thumb_key: str, width: int, height: int) -> bool:
    with task_db_session() as db:
        gallery_id = db.scalar(select(Photo.gallery_id).where(Photo.id == photo_id))
        gallery = db.scalar(select(Gallery).where(Gallery.id == gallery_id, Gallery.is_deleted.is_(False)).with_for_update())
        if gallery is None:
            return False
        photo = db.scalar(select(Photo).where(Photo.id == photo_id).with_for_update())
        if photo is None or photo.rotation_revision != revision or photo.rotation_status != "processing":
            return False
        angle = photo.requested_rotation - photo.rotation
        if gallery.cover_photo_id == photo.id:
            gallery.cover_focal_x, gallery.cover_focal_y = rotate_focal_point(gallery.cover_focal_x, gallery.cover_focal_y, angle)
        projects = db.scalars(select(Project).where(Project.cover_photo_id == photo.id).with_for_update()).all()
        for project in projects:
            project.cover_focal_x, project.cover_focal_y = rotate_focal_point(project.cover_focal_x, project.cover_focal_y, angle)
        photo.rotated_object_key = key
        photo.thumbnail_object_key = thumb_key
        photo.width, photo.height = width, height
        photo.rotation = photo.requested_rotation
        photo.rotation_status = "ready"
        photo.rotation_error = None
        photo.rotation_updated_at = datetime.now(UTC).replace(tzinfo=None)
    return True


@celery_app.task(name="rotate_photo", bind=True, max_retries=3, acks_late=True)
def rotate_photo_task(self, photo_id: str, revision: int) -> None:
    photo_uuid = uuid.UUID(photo_id)
    with task_db_session() as db:
        live_gallery = select(Gallery.id).where(Gallery.is_deleted.is_(False))
        claimed = db.scalar(
            update(Photo)
            .where(
                Photo.id == photo_uuid,
                Photo.rotation_revision == revision,
                Photo.rotation_status == "pending",
                Photo.gallery_id.in_(live_gallery),
            )
            .values(rotation_status="processing", rotation_updated_at=datetime.now(UTC).replace(tzinfo=None))
            .returning(Photo.id)
        )
        if not claimed:
            return
        photo = db.get(Photo, photo_uuid)
        if photo is None:
            return
        source_key, gallery_id, rotation = photo.object_key, photo.gallery_id, photo.requested_rotation
        content_type = photo.source_content_type or ("image/png" if source_key.lower().endswith(".png") else "image/jpeg")

    client, bucket = get_s3_client(), get_s3_settings().bucket
    prefix = f"{gallery_id}/{photo_id}_rotations/{revision}-{uuid.uuid4().hex}"
    extension = ".png" if content_type == "image/png" else ".jpg"
    key, thumb_key = f"{prefix}/image{extension}", f"{prefix}/thumbnail.avif"
    try:
        with _stream_s3_object_to_tempfile(client, bucket, source_key) as source, tempfile.TemporaryDirectory(prefix="viewport-rotation-") as scratch:
            output = str(Path(scratch) / f"image{extension}")
            if rotation:
                create_rotated_file(source, output, content_type, rotation)
                thumbnail_source = output
            else:
                thumbnail_source = source
            delivery_image = _get_pyvips().Image.new_from_file(thumbnail_source, access="sequential", fail_on="error").autorot()
            width, height = delivery_image.width, delivery_image.height
            del delivery_image
            thumbnail, _, _ = create_thumbnail_from_path(thumbnail_source)
            if rotation:
                with open(output, "rb") as image_file:
                    client.upload_fileobj(image_file, bucket, key, ExtraArgs={"ContentType": content_type, "CacheControl": "public, max-age=31536000, immutable"})
            client.put_object(Bucket=bucket, Key=thumb_key, Body=thumbnail, ContentType="image/avif", CacheControl="public, max-age=31536000, immutable")
        _publish_rotation(photo_uuid, revision, key if rotation else None, thumb_key, width, height)
    except Exception as error:
        logger.exception("Photo rotation failed: %s revision %s", photo_id, revision)
        permanent = isinstance(error, (ValueError, subprocess.CalledProcessError))
        retry = not permanent and self.request.retries < self.max_retries
        with task_db_session() as db:
            db.execute(
                update(Photo)
                .where(Photo.id == photo_uuid, Photo.rotation_revision == revision, Photo.rotation_status == "processing")
                .values(
                    rotation_status="pending" if retry else "failed",
                    rotation_error=None if retry else "Could not save rotation. Please retry.",
                    rotation_updated_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
        if retry:
            raise self.retry(exc=error, countdown=10 * (self.request.retries + 1)) from error


@celery_app.task(name="reconcile_photo_rotations")
def reconcile_photo_rotations_task() -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    with task_db_session() as db:
        # A lost/killed worker cannot publish after this lease expires.
        db.execute(update(Photo).where(Photo.rotation_status == "processing", Photo.rotation_updated_at < now - timedelta(minutes=35)).values(rotation_status="pending"))
        work = db.execute(
            select(Photo.id, Photo.rotation_revision)
            .join(Photo.gallery)
            .where(
                Gallery.is_deleted.is_(False),
                Photo.rotation_status == "pending",
                Photo.rotation_updated_at < now - timedelta(minutes=10),
            )
            .order_by(Photo.rotation_updated_at)
            .limit(500)
        ).all()
        for photo_id, revision in work:
            db.execute(update(Photo).where(Photo.id == photo_id, Photo.rotation_revision == revision).values(rotation_updated_at=now))
    for photo_id, revision in work:
        try:
            rotate_photo_task.delay(str(photo_id), revision)
        except Exception:
            logger.warning("Could not enqueue pending rotation %s", photo_id, exc_info=True)


@celery_app.task(name="cleanup_photo_rotation_versions")
def cleanup_photo_rotation_versions_task() -> None:
    client, bucket = get_s3_client(), get_s3_settings().bucket
    # Delivery URLs currently expire after two hours. Keep one extra hour.
    cutoff = datetime.now(UTC) - timedelta(hours=3)
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if "_rotations/" not in key or obj["LastModified"] >= cutoff:
                continue
            # Check references immediately before deleting, so active files survive.
            with task_db_session() as db:
                referenced = db.scalar(select(Photo.id).where((Photo.rotated_object_key == key) | (Photo.thumbnail_object_key == key)).limit(1))
                try:
                    photo_id = uuid.UUID(key.split("/", 2)[1].removesuffix("_rotations"))
                except ValueError, IndexError:
                    continue
                changed = db.scalar(select(Photo.rotation_updated_at).where(Photo.id == photo_id))
                if changed is not None and changed >= cutoff.replace(tzinfo=None):
                    continue
            if referenced is None:
                client.delete_object(Bucket=bucket, Key=key)
