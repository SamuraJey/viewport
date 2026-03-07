import contextlib
import re
import unicodedata
from pathlib import Path
from uuid import UUID

import zipstream
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.api.photo import CONTENT_TYPE_MAP
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.logger import logger
from viewport.models.db import get_db
from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client, get_s3_settings
from viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto

router = APIRouter(prefix="/s", tags=["public"])

_WINDOWS_RESERVED_NAMES = {
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
}
_SEPARATOR_LIKE_CHARS = {"/", "\\", "\u2215", "\u2044"}
_FORBIDDEN_ZIP_CHARS_RE = re.compile(r'[<>:"|?*\x00-\x1F]')
_WHITESPACE_RE = re.compile(r"\s+")
_WINDOWS_DRIVE_PREFIX_RE = re.compile(r"^[A-Za-z]:")
_MAX_ZIP_ENTRY_NAME_BYTES = 255
_EXTENSION_ONLY_TOKENS = {ext.lstrip(".") for ext in CONTENT_TYPE_MAP}


def _build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
    safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
    return f'{disposition_type}; filename="{safe_filename}"'


def _split_name_and_ext(filename: str) -> tuple[str, str]:
    path = Path(filename)
    suffix = path.suffix if path.suffix else ""
    stem = path.stem if path.stem else "file"
    return stem, suffix


def _truncate_utf8(value: str, max_bytes: int) -> str:
    if max_bytes <= 0:
        return ""
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    truncated = encoded[:max_bytes]
    return truncated.decode("utf-8", errors="ignore")


def _truncate_preserving_extension(filename: str, max_bytes: int = _MAX_ZIP_ENTRY_NAME_BYTES) -> str:
    if len(filename.encode("utf-8")) <= max_bytes:
        return filename

    stem, suffix = _split_name_and_ext(filename)
    suffix_bytes = len(suffix.encode("utf-8"))

    if suffix_bytes >= max_bytes:
        return _truncate_utf8(stem, max_bytes)

    stem_max_bytes = max_bytes - suffix_bytes
    truncated_stem = _truncate_utf8(stem, stem_max_bytes).rstrip(" .")
    if not truncated_stem:
        truncated_stem = "file"
    return f"{truncated_stem}{suffix}"


def _sanitize_zip_entry_name(filename: str, fallback: str) -> str:
    normalized = unicodedata.normalize("NFKC", filename or "")
    cleaned = "".join(ch for ch in normalized if unicodedata.category(ch)[0] != "C").strip()
    if not cleaned:
        return fallback

    if any(separator in cleaned for separator in _SEPARATOR_LIKE_CHARS):
        return fallback

    if _WINDOWS_DRIVE_PREFIX_RE.match(cleaned):
        return fallback

    sanitized = _FORBIDDEN_ZIP_CHARS_RE.sub("_", cleaned)
    sanitized = _WHITESPACE_RE.sub(" ", sanitized).strip(" .")

    if not sanitized or sanitized in {".", ".."}:
        return fallback

    if "." not in sanitized and sanitized.casefold() in _EXTENSION_ONLY_TOKENS:
        return fallback

    stem, _ = _split_name_and_ext(sanitized)
    if stem.casefold() in _WINDOWS_RESERVED_NAMES:
        return fallback

    sanitized = _truncate_preserving_extension(sanitized)
    if not sanitized or sanitized in {".", ".."}:
        return fallback

    return sanitized


def _build_zip_fallback_name(filename: str, object_key: str, fallback_stem: str) -> str:
    normalized = unicodedata.normalize("NFKC", filename or "")
    leaf = normalized.replace("\\", "/").rsplit("/", 1)[-1]
    extension = Path(leaf).suffix.lower()
    if extension in CONTENT_TYPE_MAP:
        return f"{fallback_stem}{extension}"

    object_key_extension = Path(object_key).suffix.lower()
    if object_key_extension in CONTENT_TYPE_MAP:
        return f"{fallback_stem}{object_key_extension}"

    return f"{fallback_stem}.jpg"


def _make_unique_zip_entry_name(filename: str, used_names: set[str]) -> str:
    candidate = filename
    stem, suffix = _split_name_and_ext(filename)
    counter = 1

    while candidate.casefold() in used_names:
        suffix_part = f" ({counter})"
        stem_budget = _MAX_ZIP_ENTRY_NAME_BYTES - len(suffix.encode("utf-8"))
        candidate_stem = _truncate_utf8(f"{stem}{suffix_part}", stem_budget).rstrip(" .")
        if not candidate_stem:
            candidate_stem = "file"
        candidate = f"{candidate_stem}{suffix}"
        counter += 1

    used_names.add(candidate.casefold())
    return candidate


def get_sharelink_repository(db: AsyncSession = Depends(get_db)) -> ShareLinkRepository:
    return ShareLinkRepository(db)


async def get_valid_sharelink(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository)) -> ShareLink:
    """Get valid sharelink."""
    sharelink = await repo.get_valid_sharelink(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found")
    return sharelink


# TODO rewrite to be def or fully async.
@router.get("/{share_id}", response_model=PublicGalleryResponse)
async def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    limit: int | None = Query(None, ge=1, le=500, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> PublicGalleryResponse:
    """Get public gallery photos."""
    # Photos - ensure deterministic ordering by filename (case-insensitive)
    photos = await repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: p.display_name.lower())

    # Apply pagination if limit is specified
    photos_to_process = photos[offset : offset + limit] if limit else photos

    logger.info(f"Generating public gallery view for share {share_id} with {len(photos_to_process)} photos (offset={offset}, limit={limit}, total={len(photos)})")

    thumbnail_keys = [photo.thumbnail_object_key for photo in photos_to_process]
    thumb_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(
        {photo.object_key: _build_content_disposition(photo.display_name, disposition_type="inline") for photo in photos_to_process}
    )

    photo_list = []
    for photo in photos_to_process:
        presigned_url = full_url_map.get(photo.object_key, "")
        presigned_url_thumb = thumb_url_map.get(photo.thumbnail_object_key, "")

        if presigned_url and presigned_url_thumb:
            photo_list.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    thumbnail_url=presigned_url_thumb,
                    full_url=presigned_url,
                    filename=photo.display_name,
                    width=getattr(photo, "width", None),
                    height=getattr(photo, "height", None),
                )
            )

    gallery: Gallery = sharelink.gallery  # lazy-loaded
    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = None

    logger.info(f"Public gallery {gallery.id}: cover_photo_id={cover_id}")

    if cover_id:
        # Explicitly fetch the cover photo from database instead of relying on viewonly relationship
        # This ensures we get the most up-to-date cover_photo even after it's just been set
        cover_photo_obj = None
        if gallery.cover_photo_id:
            stmt = select(Photo).where(Photo.id == gallery.cover_photo_id)
            cover_photo_obj = (await repo.db.execute(stmt)).scalar_one_or_none()

            if cover_photo_obj:
                logger.info(f"Found cover photo: {cover_photo_obj.object_key}")
            else:
                logger.warning(f"Cover photo {cover_id} not found in database")

        cover_filename = None
        cover_url = None
        if cover_photo_obj:
            cover_filename = cover_photo_obj.display_name
            cover_url = full_url_map.get(cover_photo_obj.object_key) or await s3_client.generate_presigned_url_async(
                cover_photo_obj.object_key,
                response_content_disposition=_build_content_disposition(cover_photo_obj.display_name, disposition_type="inline"),
            )
            cover_thumb_url = thumb_url_map.get(cover_photo_obj.thumbnail_object_key, cover_url)
            if cover_url == cover_thumb_url:
                logger.warning(f"Cover photo {cover_id} presigned URL is the same for full and thumbnail, which may indicate an issue: {cover_url}")

        if cover_url:
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_thumb_url, filename=cover_filename)
            logger.info(f"Cover set successfully: {cover_filename}")
        else:
            logger.warning(f"Cover URL not generated for photo {cover_id}")

    photographer = getattr(gallery.owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    dt = getattr(gallery, "shooting_date", None) or getattr(gallery, "created_at", None) or getattr(sharelink, "created_at", None)
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    # Build site URL base
    site_url = str(request.base_url).rstrip("/")

    # Increment views only on first page load (offset=0)
    if offset == 0:
        await repo.increment_views(share_id)

    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=site_url,
        total_photos=len(photos),
    )


@router.get("/{share_id}/download/all")
async def download_all_photos_zip(
    share_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    """Download all photos as zip."""
    photos = await repo.get_photos_by_gallery_id(sharelink.gallery_id)
    with contextlib.suppress(Exception):
        photos = sorted(photos, key=lambda p: p.display_name.lower())

    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    settings = get_s3_settings()

    z = zipstream.ZipStream()
    used_names: set[str] = set()

    for photo in photos:
        key = photo.object_key
        fallback = _build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
        filename = _sanitize_zip_entry_name(photo.display_name, fallback=fallback)
        filename = _make_unique_zip_entry_name(filename, used_names)

        def file_generator(object_key: str = key):
            client = get_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=object_key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    await repo.increment_zip_downloads(share_id)
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(photos)})

    headers = {"Content-Disposition": f'attachment; filename="gallery_{share_id}.zip"'}

    return StreamingResponse(z, media_type="application/zip", headers=headers)
