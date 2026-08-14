import contextlib
from datetime import date, datetime
from uuid import UUID

import zipstream
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse

from viewport.dependencies import get_gallery_repository, get_project_repository, get_redis, get_sharelink_repository
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.filename_utils import build_content_disposition
from viewport.logger import logger
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink, ShareScopeType
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.project_repository import ProjectRepository
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client, get_s3_settings
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder
from viewport.schemas.photo import PHOTO_ID_BATCH_MAX
from viewport.schemas.public import (
    MediaCover,
    MediaStatus,
    MediaType,
    PublicCover,
    PublicGalleryAppearance,
    PublicGalleryResponse,
    PublicPhoto,
    PublicProjectGallery,
    PublicProjectResponse,
    PublicShareResponse,
    PublicShareUnlockRequest,
)
from viewport.services.auth_rate_limiter import get_auth_rate_limit_settings, resolve_client_ip
from viewport.services.project_presence import record_project_presence
from viewport.services.redis_service import RedisService
from viewport.sharelink_access import PUBLIC_CACHE_CONTROL_HEADERS, get_available_public_sharelink, get_public_request_base_url, get_valid_public_sharelink, unlock_sharelink_password
from viewport.zip_utils import build_zip_fallback_name, make_content_disposition_header, make_unique_zip_entry_name, sanitize_zip_entry_name

router = APIRouter(prefix="/s", tags=["public"])
INTERNAL_PROJECT_NAVIGATION_HEADER = "x-viewport-internal-navigation"


def _resolved_client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    try:
        return resolve_client_ip(request, get_auth_rate_limit_settings().trusted_proxy_cidrs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid forwarded client address") from exc


def _resolve_public_sorting(gallery: Gallery) -> tuple[GalleryPhotoSortBy, SortOrder]:
    sort_by = GalleryPhotoSortBy.ORIGINAL_FILENAME
    sort_order = SortOrder.ASC

    with contextlib.suppress(ValueError):
        sort_by = GalleryPhotoSortBy(getattr(gallery, "public_sort_by", sort_by.value))
    with contextlib.suppress(ValueError):
        sort_order = SortOrder(getattr(gallery, "public_sort_order", sort_order.value))

    return sort_by, sort_order


async def get_valid_sharelink(
    share_id: UUID,
    request: Request,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
) -> ShareLink:
    """Get active, non-expired sharelink and enforce optional password."""
    return await get_valid_public_sharelink(share_id, repo, request)


@router.post("/{share_id}/unlock", status_code=204)
async def unlock_sharelink(
    share_id: UUID,
    request: Request,
    response: Response,
    payload: PublicShareUnlockRequest | None = None,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
) -> None:
    """Validate a protected public share password and issue an HttpOnly access cookie."""
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await get_available_public_sharelink(share_id, repo)
    await unlock_sharelink_password(sharelink, payload.password if payload is not None else None, request, response)


def _site_url(request: Request) -> str:
    return get_public_request_base_url(request)


def _date_str(*candidates: date | datetime | None) -> str:
    for candidate in candidates:
        if candidate:
            return candidate.strftime("%d.%m.%Y")
    return ""


def _is_public_media_ready(photo: Photo) -> bool:
    return bool(photo.status == PhotoUploadStatus.SUCCESSFUL and photo.thumbnail_object_key and (photo.media_type != MediaType.VIDEO.value or photo.playback_object_key))


async def _build_public_gallery_response(
    *,
    share_id: UUID,
    request: Request,
    response: Response,
    repo: ShareLinkRepository,
    s3_client: AsyncS3Client,
    sharelink: ShareLink,
    gallery: Gallery,
    limit: int | None,
    offset: int,
    parent_share_id: UUID | None = None,
    record_view: bool = True,
    project_navigation: PublicProjectResponse | None = None,
    override_appearance: PublicGalleryAppearance | None = None,
    override_cover: PublicCover | None = None,
) -> PublicGalleryResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)

    sort_by, order = _resolve_public_sorting(gallery)
    photo_stats = await repo.get_photo_stats_by_gallery(gallery.id, status=PhotoUploadStatus.SUCCESSFUL)
    photos_to_process = await repo.get_photos_by_gallery_id(
        gallery_id=gallery.id,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        order=order,
        status=PhotoUploadStatus.SUCCESSFUL,
    )
    photos_to_process = [photo for photo in photos_to_process if _is_public_media_ready(photo)]

    logger.info(
        "Generating public gallery view for share %s with %s photos (offset=%s, limit=%s, total=%s, sort_by=%s, order=%s)",
        share_id,
        len(photos_to_process),
        offset,
        limit,
        photo_stats.photo_count,
        sort_by.value,
        order.value,
    )

    # Collect keys for batch presigning
    thumbnail_keys = [photo.thumbnail_object_key for photo in photos_to_process]

    # Build disposition map: for videos use playback key, for images use object key
    full_dispositions: dict[str, str] = {}
    for photo in photos_to_process:
        if photo.media_type == MediaType.VIDEO.value and photo.playback_object_key:
            full_key = photo.playback_object_key
        else:
            full_key = photo.object_key
        full_dispositions[full_key] = build_content_disposition(photo.display_name, disposition_type="inline")

    thumb_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(full_dispositions)

    photo_list = []
    for photo in photos_to_process:
        thumb_url = thumb_url_map.get(photo.thumbnail_object_key, "")

        if photo.media_type == MediaType.VIDEO.value and photo.playback_object_key:
            presigned_url = full_url_map.get(photo.playback_object_key, "")
            playback_url = presigned_url
        else:
            presigned_url = full_url_map.get(photo.object_key, "")
            playback_url = None

        if presigned_url and thumb_url:
            photo_list.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    media_type=MediaType(photo.media_type),
                    thumbnail_url=thumb_url,
                    full_url=presigned_url,
                    playback_url=playback_url,
                    filename=photo.display_name,
                    duration_ms=photo.duration_ms,
                    width=photo.width,
                    height=photo.height,
                    status=MediaStatus.SUCCESSFUL,
                    processing_error=photo.processing_error,
                )
            )

    # --- Effective cover selection with fallback ---
    cover_photo_obj = None
    if gallery.cover_photo_id:
        cover_photo_obj = await repo.get_photo_by_id_and_gallery(gallery.cover_photo_id, gallery.id)

    # Only SUCCESSFUL media with valid object/thumbnail keys can be a cover
    if cover_photo_obj and not _is_public_media_ready(cover_photo_obj):
        cover_photo_obj = None

    if cover_photo_obj is None:
        if photos_to_process and offset == 0:
            cover_photo_obj = photos_to_process[0]
        else:
            fallback_photos = await repo.get_photos_by_gallery_id(
                gallery_id=gallery.id,
                limit=1,
                offset=0,
                sort_by=sort_by,
                order=order,
                status=PhotoUploadStatus.SUCCESSFUL,
            )
            cover_photo_obj = next(
                (photo for photo in fallback_photos if _is_public_media_ready(photo)),
                None,
            )

    # Override cover with project-level cover when provided (for project folder views)
    effective_cover: MediaCover | None = None
    if override_cover is not None:
        effective_cover = override_cover
    else:
        if cover_photo_obj and cover_photo_obj.thumbnail_object_key:
            # Determine cover full key (playback for video, object for image)
            if cover_photo_obj.media_type == MediaType.VIDEO.value and cover_photo_obj.playback_object_key:
                cover_full_key = cover_photo_obj.playback_object_key
            else:
                cover_full_key = cover_photo_obj.object_key

            cover_full_url = full_url_map.get(cover_full_key)
            cover_thumb_url = thumb_url_map.get(cover_photo_obj.thumbnail_object_key)
            if cover_full_url is None:
                try:
                    cover_full_url = await s3_client.generate_presigned_url_async(
                        cover_full_key,
                        response_content_disposition=build_content_disposition(cover_photo_obj.display_name, disposition_type="inline"),
                    )
                except (ClientError, BotoCoreError) as exc:
                    logger.warning("Failed to presign gallery cover full object %s: %s", cover_full_key, exc)
                    cover_full_url = None
            if cover_thumb_url is None:
                try:
                    cover_thumb_url = await s3_client.generate_presigned_url_async(cover_photo_obj.thumbnail_object_key)
                except (ClientError, BotoCoreError) as exc:
                    logger.warning("Failed to presign gallery cover thumbnail %s: %s", cover_photo_obj.thumbnail_object_key, exc)
                    cover_thumb_url = None

            if cover_full_url and cover_thumb_url:
                is_video = cover_photo_obj.media_type == MediaType.VIDEO.value and cover_photo_obj.playback_object_key
                effective_cover = MediaCover(
                    photo_id=str(cover_photo_obj.id),
                    media_type=MediaType(cover_photo_obj.media_type),
                    full_url=cover_full_url,
                    thumbnail_url=cover_thumb_url,
                    playback_url=cover_full_url if is_video else None,
                    filename=cover_photo_obj.display_name,
                )

    owner = getattr(gallery, "owner", None) or getattr(getattr(sharelink, "project", None), "owner", None)
    photographer = getattr(owner, "display_name", None) or ""
    gallery_name = getattr(gallery, "name", "")
    project_name = getattr(getattr(sharelink, "project", None), "name", None)
    date_str = _date_str(
        getattr(gallery, "shooting_date", None),
        getattr(gallery, "created_at", None),
        getattr(sharelink, "created_at", None),
    )

    if record_view and offset == 0:
        client_ip = _resolved_client_ip(request)
        await repo.record_view(
            share_id,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )

    return PublicGalleryResponse(
        photos=photo_list,
        cover=effective_cover,
        photographer=photographer,
        gallery_name=gallery_name,
        date=date_str,
        site_url=_site_url(request),
        total_photos=photo_stats.photo_count,
        total_size_bytes=photo_stats.total_size_bytes,
        project_id=str(gallery.project_id) if getattr(gallery, "project_id", None) else None,
        project_name=project_name,
        parent_share_id=str(parent_share_id) if parent_share_id else None,
        project_navigation=project_navigation,
        appearance=override_appearance
        if override_appearance is not None
        else PublicGalleryAppearance(
            cover_focal_x=float(getattr(gallery, "cover_focal_x", 50.0)),
            cover_focal_y=float(getattr(gallery, "cover_focal_y", 50.0)),
            cover_display_option=getattr(gallery, "cover_display_option", "centered_title"),
            photo_spacing=getattr(gallery, "public_photo_spacing", "medium"),
            color_scheme=getattr(gallery, "public_color_scheme", "light"),
        ),
    )


async def _build_project_cover(
    *,
    gallery: Gallery | None,
    gallery_repo: GalleryRepository,
    s3_client: AsyncS3Client,
) -> MediaCover | None:
    if gallery is None:
        return None

    cover_photo = None
    if gallery.cover_photo_id:
        cover_photo = await gallery_repo.get_photo_by_id_and_gallery(gallery.cover_photo_id, gallery.id)

    # Exclude incomplete media, including videos without a web-playable derivative.
    if cover_photo and not _is_public_media_ready(cover_photo):
        cover_photo = None

    if cover_photo is None:
        recent_photos = await gallery_repo.get_photos_by_gallery_id(gallery.id)
        # Pick first complete, publicly playable media item.
        cover_photo = next(
            (photo for photo in recent_photos if _is_public_media_ready(photo)),
            None,
        )

    if cover_photo is None or not cover_photo.thumbnail_object_key:
        return None

    # For videos, use playback key as full url; for images, use object key
    if cover_photo.media_type == MediaType.VIDEO.value and cover_photo.playback_object_key:
        full_key = cover_photo.playback_object_key
        is_video = True
    else:
        full_key = cover_photo.object_key
        is_video = False

    cover_disposition = build_content_disposition(cover_photo.display_name, disposition_type="inline")
    urls = await s3_client.generate_presigned_urls_batch_for_dispositions(
        {
            full_key: cover_disposition,
            cover_photo.thumbnail_object_key: None,
        }
    )
    full_url = urls.get(full_key)
    thumbnail_url = urls.get(cover_photo.thumbnail_object_key)
    if full_url is None:
        try:
            full_url = await s3_client.generate_presigned_url_async(
                full_key,
                response_content_disposition=cover_disposition,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to presign full cover object %s: %s", full_key, exc)
            return None
    if thumbnail_url is None:
        try:
            thumbnail_url = await s3_client.generate_presigned_url_async(cover_photo.thumbnail_object_key)
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to presign thumbnail cover object %s: %s", cover_photo.thumbnail_object_key, exc)
            return None

    return MediaCover(
        photo_id=str(cover_photo.id),
        media_type=MediaType(cover_photo.media_type),
        full_url=full_url,
        thumbnail_url=thumbnail_url,
        playback_url=full_url if is_video else None,
        filename=cover_photo.display_name,
    )


async def _build_public_project_response(
    *,
    share_id: UUID,
    request: Request,
    response: Response,
    project_repo: ProjectRepository,
    gallery_repo: GalleryRepository,
    s3_client: AsyncS3Client,
    sharelink: ShareLink,
    redis: RedisService | None = None,
    record_view: bool = True,
) -> PublicProjectResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)

    project = sharelink.project
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    await record_project_presence(
        redis,
        project.id,
        ip_address=_resolved_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    galleries = await project_repo.get_visible_project_folders(project.id)

    gallery_ids = [gallery.id for gallery in galleries]
    cover_photo_ids = [gallery.cover_photo_id for gallery in galleries if gallery.cover_photo_id]
    photo_count_by_gallery, total_size_by_gallery, _, cover_thumbnail_by_photo_id, recent_thumbnail_keys_by_gallery = await gallery_repo.get_gallery_list_enrichment(
        gallery_ids,
        cover_photo_ids,
        recent_limit=1,
        status=PhotoUploadStatus.SUCCESSFUL,
    )

    thumbnail_keys: list[str] = list(cover_thumbnail_by_photo_id.values())
    thumbnail_keys.extend(recent_keys[0] for recent_keys in recent_thumbnail_keys_by_gallery.values() if recent_keys)
    thumbnail_url_map = await s3_client.generate_presigned_urls_batch(list(dict.fromkeys(thumbnail_keys)), expires_in=7200) if thumbnail_keys else {}

    # Build project cover from project-level cover_photo_id, fall back to first gallery
    project_cover: MediaCover | None = None
    if project.cover_photo_id:
        cover_photo = await project_repo.get_photo_by_id_for_project(
            project.id,
            project.cover_photo_id,
            listed_only=True,
        )
        if cover_photo and _is_public_media_ready(cover_photo):
            # Determine full key based on media type
            if cover_photo.media_type == MediaType.VIDEO.value and cover_photo.playback_object_key:
                full_key = cover_photo.playback_object_key
                is_video = True
            else:
                full_key = cover_photo.object_key
                is_video = False
            cover_disposition = build_content_disposition(cover_photo.display_name, disposition_type="inline")
            urls = await s3_client.generate_presigned_urls_batch_for_dispositions(
                {
                    full_key: cover_disposition,
                    cover_photo.thumbnail_object_key: None,
                }
            )
            full_url = urls.get(full_key)
            thumbnail_url = urls.get(cover_photo.thumbnail_object_key)
            if full_url is None:
                try:
                    full_url = await s3_client.generate_presigned_url_async(
                        full_key,
                        response_content_disposition=cover_disposition,
                    )
                except (ClientError, BotoCoreError) as exc:
                    logger.warning("Failed to presign project cover full object %s: %s", full_key, exc)
            if thumbnail_url is None:
                try:
                    thumbnail_url = await s3_client.generate_presigned_url_async(cover_photo.thumbnail_object_key)
                except (ClientError, BotoCoreError) as exc:
                    logger.warning("Failed to presign project cover thumbnail %s: %s", cover_photo.thumbnail_object_key, exc)
            if full_url and thumbnail_url:
                project_cover = MediaCover(
                    photo_id=str(cover_photo.id),
                    media_type=MediaType(cover_photo.media_type),
                    full_url=full_url,
                    thumbnail_url=thumbnail_url,
                    playback_url=full_url if is_video else None,
                    filename=cover_photo.display_name,
                )
    if project_cover is None:
        project_cover = await _build_project_cover(
            gallery=galleries[0] if galleries else None,
            gallery_repo=gallery_repo,
            s3_client=s3_client,
        )
    gallery_items: list[PublicProjectGallery] = []
    total_listed_photos = 0
    total_size_bytes = 0
    for gallery in galleries:
        photo_count = photo_count_by_gallery.get(gallery.id, 0)
        total_listed_photos += photo_count
        total_size_bytes += total_size_by_gallery.get(gallery.id, 0)
        cover_thumbnail_key = cover_thumbnail_by_photo_id.get(gallery.cover_photo_id) if gallery.cover_photo_id else None
        cover_thumbnail_url = thumbnail_url_map.get(cover_thumbnail_key) if cover_thumbnail_key else None
        if cover_thumbnail_url is None:
            recent_keys = recent_thumbnail_keys_by_gallery.get(gallery.id, [])
            if recent_keys:
                cover_thumbnail_url = thumbnail_url_map.get(recent_keys[0])
        gallery_items.append(
            PublicProjectGallery(
                gallery_id=str(gallery.id),
                gallery_name=gallery.name,
                photo_count=photo_count,
                cover_thumbnail_url=cover_thumbnail_url,
                route_path=f"/share/{share_id}/galleries/{gallery.id}",
                direct_share_path=None,
            )
        )

    if record_view:
        client_ip = _resolved_client_ip(request)
        await ShareLinkRepository(project_repo.db).record_view(
            share_id,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )

    owner = getattr(project, "owner", None)
    photographer = getattr(owner, "display_name", None) or ""
    return PublicProjectResponse(
        project_id=str(project.id),
        project_name=project.name,
        photographer=photographer,
        date=_date_str(getattr(project, "shooting_date", None), getattr(project, "created_at", None), getattr(sharelink, "created_at", None)),
        site_url=_site_url(request),
        cover=project_cover,
        total_listed_galleries=len(gallery_items),
        total_listed_photos=total_listed_photos,
        total_size_bytes=total_size_bytes,
        galleries=gallery_items,
        appearance=PublicGalleryAppearance(
            cover_focal_x=float(getattr(project, "cover_focal_x", 50.0)),
            cover_focal_y=float(getattr(project, "cover_focal_y", 50.0)),
            cover_display_option=getattr(project, "cover_display_option", "centered_title"),
            photo_spacing=getattr(project, "public_photo_spacing", "medium"),
            color_scheme=getattr(project, "public_color_scheme", "light"),
        ),
    )


async def _load_project_zip_entries(
    project_id: UUID,
    *,
    project_repo: ProjectRepository,
    repo: ShareLinkRepository,
) -> list[tuple[str, list[Photo]]]:
    galleries = await project_repo.get_visible_project_folders(project_id)
    if not galleries:
        return []

    photos_by_gallery = await repo.get_photos_by_visible_project(project_id, status=PhotoUploadStatus.SUCCESSFUL)
    return [(gallery.name, photos_by_gallery.get(gallery.id, [])) for gallery in galleries]


def _ensure_gallery_share_scope(sharelink: ShareLink) -> None:
    if sharelink.scope_type != ShareScopeType.GALLERY.value:
        raise HTTPException(status_code=404, detail="Gallery share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)


def _require_gallery_share_id(sharelink: ShareLink) -> UUID:
    _ensure_gallery_share_scope(sharelink)
    if sharelink.gallery_id is None:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink.gallery_id


async def _get_downloadable_public_photo(
    *,
    sharelink: ShareLink,
    photo_id: UUID,
    repo: ShareLinkRepository,
) -> Photo:
    if sharelink.scope_type == ShareScopeType.PROJECT.value:
        if sharelink.project_id is None:
            raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
        photos = await repo.get_photos_by_ids_and_project(
            sharelink.project_id,
            [photo_id],
            listed_only=True,
            status=PhotoUploadStatus.SUCCESSFUL,
        )
    else:
        gallery_id = _require_gallery_share_id(sharelink)
        photos = await repo.get_photos_by_ids_and_gallery(gallery_id, [photo_id], status=PhotoUploadStatus.SUCCESSFUL)

    if not photos:
        raise HTTPException(status_code=404, detail="Photo not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return photos[0]


@router.get("/{share_id}", response_model=PublicShareResponse)
async def get_photos_by_sharelink(
    share_id: UUID,
    request: Request,
    response: Response,
    limit: int | None = Query(None, ge=1, le=500, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
    redis: RedisService | None = Depends(get_redis),
) -> PublicShareResponse:
    if sharelink.scope_type == ShareScopeType.PROJECT.value:
        return await _build_public_project_response(
            share_id=share_id,
            request=request,
            response=response,
            project_repo=project_repo,
            gallery_repo=gallery_repo,
            s3_client=s3_client,
            sharelink=sharelink,
            redis=redis,
        )

    gallery = sharelink.gallery
    if gallery is None:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return await _build_public_gallery_response(
        share_id=share_id,
        request=request,
        response=response,
        repo=repo,
        s3_client=s3_client,
        sharelink=sharelink,
        gallery=gallery,
        limit=limit,
        offset=offset,
    )


@router.get("/{share_id}/galleries/{gallery_id}", response_model=PublicGalleryResponse)
async def get_project_gallery_by_sharelink(
    share_id: UUID,
    gallery_id: UUID,
    request: Request,
    response: Response,
    limit: int | None = Query(None, ge=1, le=500, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
    redis: RedisService | None = Depends(get_redis),
) -> PublicGalleryResponse:
    if sharelink.scope_type != ShareScopeType.PROJECT.value or sharelink.project is None:
        raise HTTPException(status_code=404, detail="Project share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery = await project_repo.get_visible_project_gallery_by_id(sharelink.project.id, gallery_id)
    if gallery is None:
        logger.warning(
            "Denied hidden or missing gallery access via project share",
            extra={"scope_type": "project", "share_id": str(share_id), "gallery_id": str(gallery_id)},
        )
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    record_project_view = request.headers.get(INTERNAL_PROJECT_NAVIGATION_HEADER) != "1"
    project_navigation = await _build_public_project_response(
        share_id=share_id,
        request=request,
        response=response,
        project_repo=project_repo,
        gallery_repo=gallery_repo,
        s3_client=s3_client,
        sharelink=sharelink,
        redis=redis,
        record_view=False,
    )

    return await _build_public_gallery_response(
        share_id=share_id,
        request=request,
        response=response,
        repo=repo,
        s3_client=s3_client,
        sharelink=sharelink,
        gallery=gallery,
        limit=limit,
        offset=offset,
        parent_share_id=share_id,
        record_view=record_project_view,
        project_navigation=project_navigation,
        override_appearance=project_navigation.appearance,
        override_cover=project_navigation.cover,
    )


@router.get("/{share_id}/photos/by-ids", response_model=list[PublicPhoto])
async def get_public_photos_by_ids(
    share_id: UUID,
    response: Response,
    photo_ids: list[UUID] = Query(..., min_length=1, max_length=PHOTO_ID_BATCH_MAX, description="Ordered list of photo ids to resolve"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> list[PublicPhoto]:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    unique_photo_ids = list(dict.fromkeys(photo_ids))
    if sharelink.scope_type == ShareScopeType.PROJECT.value:
        if sharelink.project_id is None:
            raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
        photos = await repo.get_photos_by_ids_and_project(
            sharelink.project_id,
            unique_photo_ids,
            listed_only=True,
        )
    else:
        gallery_id = _require_gallery_share_id(sharelink)
        photos = await repo.get_photos_by_ids_and_gallery(gallery_id, unique_photo_ids)
    photo_map = {photo.id: photo for photo in photos}
    # Filter to complete media only; a video is public only after its playback derivative exists.
    successful = [photo_map[photo_id] for photo_id in unique_photo_ids if photo_id in photo_map and _is_public_media_ready(photo_map[photo_id])]

    if not successful:
        return []

    thumbnail_keys = [photo.thumbnail_object_key for photo in successful]

    # Build disposition map: for videos use playback key, for images use object key
    full_dispositions: dict[str, str] = {}
    for photo in successful:
        if photo.media_type == MediaType.VIDEO.value and photo.playback_object_key:
            full_key = photo.playback_object_key
        else:
            full_key = photo.object_key
        full_dispositions[full_key] = build_content_disposition(photo.display_name, disposition_type="inline")

    thumb_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(full_dispositions)

    result: list[PublicPhoto] = []
    for photo in successful:
        thumb_url = thumb_url_map.get(photo.thumbnail_object_key, "")

        if photo.media_type == MediaType.VIDEO.value and photo.playback_object_key:
            presigned_url = full_url_map.get(photo.playback_object_key, "")
            playback_url = presigned_url
        else:
            presigned_url = full_url_map.get(photo.object_key, "")
            playback_url = None

        if presigned_url and thumb_url:
            result.append(
                PublicPhoto(
                    photo_id=str(photo.id),
                    media_type=MediaType(photo.media_type),
                    thumbnail_url=thumb_url,
                    full_url=presigned_url,
                    playback_url=playback_url,
                    filename=photo.display_name,
                    duration_ms=photo.duration_ms,
                    width=photo.width,
                    height=photo.height,
                    status=MediaStatus.SUCCESSFUL,
                    processing_error=photo.processing_error,
                )
            )

    return result


@router.head("/{share_id}/photos/{photo_id}/download")
async def check_public_photo_download(
    photo_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> Response:
    """Check whether one public/share photo can be downloaded."""
    await _get_downloadable_public_photo(sharelink=sharelink, photo_id=photo_id, repo=repo)
    return Response(status_code=204, headers=PUBLIC_CACHE_CONTROL_HEADERS)


@router.get("/{share_id}/photos/{photo_id}/download")
async def download_public_photo(
    share_id: UUID,
    photo_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> RedirectResponse:
    """Redirect a public single-photo download to an attachment presigned URL.

    The browser follows the redirect as a navigation, so S3-compatible storage
    does not need JavaScript CORS headers for single-photo downloads.
    """
    photo = await _get_downloadable_public_photo(sharelink=sharelink, photo_id=photo_id, repo=repo)
    filename = photo.display_name or f"photo-{photo.id}"
    download_url = await s3_client.generate_presigned_url_async(
        photo.object_key,
        expires_in=7200,
        response_content_disposition=build_content_disposition(
            filename,
            disposition_type="attachment",
        ),
    )
    await repo.record_single_download(share_id)
    logger.log_event("download_single_photo", share_id=str(sharelink.id), extra={"photo_id": str(photo.id)})
    return RedirectResponse(download_url, status_code=303, headers=PUBLIC_CACHE_CONTROL_HEADERS)


@router.head("/{share_id}/galleries/{gallery_id}/download/all")
async def check_project_gallery_photos_zip(
    gallery_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> Response:
    """Check whether one visible project gallery ZIP can be downloaded without building it."""
    if sharelink.scope_type != ShareScopeType.PROJECT.value or sharelink.project_id is None:
        raise HTTPException(status_code=404, detail="Project share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery = await project_repo.get_visible_project_gallery_by_id(sharelink.project_id, gallery_id)
    if gallery is None:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery_photos = await repo.get_photos_by_gallery_id(gallery.id, status=PhotoUploadStatus.SUCCESSFUL)
    if not gallery_photos:
        raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    return Response(status_code=204, headers=PUBLIC_CACHE_CONTROL_HEADERS)


@router.get("/{share_id}/galleries/{gallery_id}/download/all")
async def download_project_gallery_photos_zip(
    share_id: UUID,
    gallery_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    """Download one visible gallery from a project share as zip."""
    if sharelink.scope_type != ShareScopeType.PROJECT.value or sharelink.project_id is None:
        raise HTTPException(status_code=404, detail="Project share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery = await project_repo.get_visible_project_gallery_by_id(sharelink.project_id, gallery_id)
    if gallery is None:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    settings = get_s3_settings()
    z = zipstream.ZipStream()
    used_names: set[str] = set()
    gallery_photos = await repo.get_photos_by_gallery_id(gallery.id, status=PhotoUploadStatus.SUCCESSFUL)

    if not gallery_photos:
        raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    for photo in gallery_photos:
        key = photo.object_key
        fallback = build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
        filename = sanitize_zip_entry_name(photo.display_name, fallback=fallback)
        filename = make_unique_zip_entry_name(filename, used_names)

        def file_generator(object_key: str = key):
            client = get_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=object_key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    await repo.record_zip_download(share_id)
    logger.log_event(
        "download_project_gallery_zip",
        share_id=str(sharelink.id),
        extra={"gallery_id": str(gallery.id), "photo_count": len(gallery_photos)},
    )

    safe_gallery_name = sanitize_zip_entry_name(gallery.name or f"gallery_{gallery_id}", fallback=f"gallery_{gallery_id}")
    headers = {
        "Content-Disposition": make_content_disposition_header(f"{safe_gallery_name}.zip"),
        **PUBLIC_CACHE_CONTROL_HEADERS,
    }
    return StreamingResponse(z, media_type="application/zip", headers=headers)


@router.head("/{share_id}/download/all")
async def check_download_all_photos_zip(
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> Response:
    """Check whether a public share ZIP can be downloaded without building it."""
    if sharelink.scope_type == ShareScopeType.PROJECT.value:
        project_id = sharelink.project_id
        if project_id is None:
            raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
        project_zip_entries = await _load_project_zip_entries(project_id, project_repo=project_repo, repo=repo)
        if not any(gallery_photos for _, gallery_photos in project_zip_entries):
            raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
        return Response(status_code=204, headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery_id = _require_gallery_share_id(sharelink)
    gallery_photos = await repo.get_photos_by_gallery_id(gallery_id, status=PhotoUploadStatus.SUCCESSFUL)
    if not gallery_photos:
        raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    return Response(status_code=204, headers=PUBLIC_CACHE_CONTROL_HEADERS)


@router.get("/{share_id}/download/all")
async def download_all_photos_zip(
    share_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    """Download all photos as zip."""
    used_names: set[str] = set()
    settings = get_s3_settings()
    z = zipstream.ZipStream()

    if sharelink.scope_type == ShareScopeType.PROJECT.value:
        project_id = sharelink.project_id
        if project_id is None:
            raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
        project_zip_entries = await _load_project_zip_entries(project_id, project_repo=project_repo, repo=repo)
        if not any(gallery_photos for _, gallery_photos in project_zip_entries):
            raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

        for gallery_name, gallery_photos in project_zip_entries:
            for photo in gallery_photos:
                key = photo.object_key
                fallback = build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
                filename = sanitize_zip_entry_name(f"{gallery_name} - {photo.display_name}", fallback=f"{gallery_name} - {fallback}")
                filename = make_unique_zip_entry_name(filename, used_names)

                def file_generator(object_key: str = key):
                    client = get_s3_client()
                    obj = client.get_object(Bucket=settings.bucket, Key=object_key)
                    yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

                z.add(arcname=filename, data=file_generator())

        await repo.record_zip_download(share_id)
        headers = {
            "Content-Disposition": f'attachment; filename="project_{share_id}.zip"',
            **PUBLIC_CACHE_CONTROL_HEADERS,
        }
        return StreamingResponse(z, media_type="application/zip", headers=headers)

    gallery_id = _require_gallery_share_id(sharelink)
    gallery_photos = await repo.get_photos_by_gallery_id(gallery_id, status=PhotoUploadStatus.SUCCESSFUL)

    with contextlib.suppress(Exception):
        gallery_photos = sorted(gallery_photos, key=lambda p: p.display_name.lower())

    if not gallery_photos:
        raise HTTPException(status_code=404, detail="No photos found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    for photo in gallery_photos:
        key = photo.object_key
        fallback = build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
        filename = sanitize_zip_entry_name(photo.display_name, fallback=fallback)
        filename = make_unique_zip_entry_name(filename, used_names)

        def file_generator(object_key: str = key):
            client = get_s3_client()
            obj = client.get_object(Bucket=settings.bucket, Key=object_key)
            yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

        z.add(arcname=filename, data=file_generator())

    await repo.record_zip_download(share_id)
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(gallery_photos)})

    headers = {
        "Content-Disposition": f'attachment; filename="gallery_{share_id}.zip"',
        **PUBLIC_CACHE_CONTROL_HEADERS,
    }

    return StreamingResponse(z, media_type="application/zip", headers=headers)
