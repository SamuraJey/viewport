import contextlib
from asyncio import run as asyncio_run
from datetime import date, datetime
from uuid import UUID

import zipstream
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.logger import logger
from viewport.models.db import get_db
from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink, ShareScopeType
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.project_repository import ProjectRepository
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_client, get_s3_settings
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder
from viewport.schemas.public import PublicCover, PublicGalleryResponse, PublicPhoto, PublicProjectFolder, PublicProjectResponse, PublicShareResponse
from viewport.sharelink_utils import is_sharelink_expired
from viewport.zip_utils import build_zip_fallback_name, make_unique_zip_entry_name, sanitize_zip_entry_name

router = APIRouter(prefix="/s", tags=["public"])
PUBLIC_CACHE_CONTROL_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
INTERNAL_PROJECT_NAVIGATION_HEADER = "x-viewport-internal-navigation"


def _build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
    safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
    return f'{disposition_type}; filename="{safe_filename}"'


def _resolve_public_sorting(gallery: Gallery) -> tuple[GalleryPhotoSortBy, SortOrder]:
    sort_by = GalleryPhotoSortBy.ORIGINAL_FILENAME
    sort_order = SortOrder.ASC

    with contextlib.suppress(ValueError):
        sort_by = GalleryPhotoSortBy(getattr(gallery, "public_sort_by", sort_by.value))
    with contextlib.suppress(ValueError):
        sort_order = SortOrder(getattr(gallery, "public_sort_order", sort_order.value))

    return sort_by, sort_order


def get_sharelink_repository(db: AsyncSession = Depends(get_db)) -> ShareLinkRepository:
    return ShareLinkRepository(db)


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def get_project_repository(db: AsyncSession = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


async def get_valid_sharelink(share_id: UUID, repo: ShareLinkRepository = Depends(get_sharelink_repository)) -> ShareLink:
    """Get valid sharelink."""
    sharelink = await repo.get_sharelink_for_public_access(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if not sharelink.is_active:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if is_sharelink_expired(sharelink.expires_at):
        raise HTTPException(status_code=410, detail="ShareLink expired", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink


def _site_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _date_str(*candidates: date | datetime | None) -> str:
    for candidate in candidates:
        if candidate:
            return candidate.strftime("%d.%m.%Y")
    return ""


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
) -> PublicGalleryResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)

    sort_by, order = _resolve_public_sorting(gallery)
    photo_stats = await repo.get_photo_stats_by_gallery(gallery.id)
    photos_to_process = await repo.get_photos_by_gallery_id(
        gallery_id=gallery.id,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        order=order,
    )

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
                )
            )

    cover_id = str(gallery.cover_photo_id) if getattr(gallery, "cover_photo_id", None) else None
    cover = None

    if cover_id:
        cover_photo_obj = None
        if gallery.cover_photo_id:
            stmt = select(Photo).where(Photo.id == gallery.cover_photo_id)
            cover_photo_obj = (await repo.db.execute(stmt)).scalar_one_or_none()

        cover_filename = None
        cover_url = None
        if cover_photo_obj:
            cover_filename = cover_photo_obj.display_name
            cover_url = full_url_map.get(cover_photo_obj.object_key) or await s3_client.generate_presigned_url_async(
                cover_photo_obj.object_key,
                response_content_disposition=_build_content_disposition(cover_photo_obj.display_name, disposition_type="inline"),
            )
            cover_thumb_url = thumb_url_map.get(cover_photo_obj.thumbnail_object_key, cover_url)
        else:
            cover_thumb_url = None

        if cover_url:
            cover = PublicCover(photo_id=cover_id, full_url=cover_url, thumbnail_url=cover_thumb_url or cover_url, filename=cover_filename)

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
        client_ip = request.client.host if request.client else None
        await repo.record_view(
            share_id,
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
        )

    return PublicGalleryResponse(
        photos=photo_list,
        cover=cover,
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
    )


async def _build_project_cover(
    *,
    gallery: Gallery | None,
    gallery_repo: GalleryRepository,
    s3_client: AsyncS3Client,
) -> PublicCover | None:
    if gallery is None:
        return None

    cover_photo = None
    if gallery.cover_photo_id:
        cover_photo = await gallery_repo.get_photo_by_id_and_gallery(gallery.cover_photo_id, gallery.id)

    if cover_photo is None:
        recent_photos = await gallery_repo.get_photos_by_gallery_id(gallery.id)
        cover_photo = recent_photos[0] if recent_photos else None

    if cover_photo is None or not cover_photo.object_key or not cover_photo.thumbnail_object_key:
        return None

    full_url = await s3_client.generate_presigned_url_async(
        cover_photo.object_key,
        response_content_disposition=_build_content_disposition(cover_photo.display_name, disposition_type="inline"),
    )
    thumbnail_url = await s3_client.generate_presigned_url_async(cover_photo.thumbnail_object_key)

    return PublicCover(
        photo_id=str(cover_photo.id),
        full_url=full_url,
        thumbnail_url=thumbnail_url,
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
    record_view: bool = True,
) -> PublicProjectResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)

    project = sharelink.project
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    folders = await project_repo.get_visible_project_folders(project.id)
    if not folders:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery_ids = [folder.id for folder in folders]
    cover_photo_ids = [folder.cover_photo_id for folder in folders if folder.cover_photo_id]
    photo_count_by_gallery, total_size_by_gallery, _, cover_thumbnail_by_photo_id, recent_thumbnail_keys_by_gallery = await gallery_repo.get_gallery_list_enrichment(
        gallery_ids,
        cover_photo_ids,
        recent_limit=1,
    )

    thumbnail_keys: list[str] = list(cover_thumbnail_by_photo_id.values())
    thumbnail_keys.extend(recent_keys[0] for recent_keys in recent_thumbnail_keys_by_gallery.values() if recent_keys)
    thumbnail_url_map = await s3_client.generate_presigned_urls_batch(list(dict.fromkeys(thumbnail_keys)), expires_in=7200) if thumbnail_keys else {}

    project_cover = await _build_project_cover(
        gallery=folders[0],
        gallery_repo=gallery_repo,
        s3_client=s3_client,
    )
    folder_items: list[PublicProjectFolder] = []
    total_listed_photos = 0
    total_size_bytes = 0
    for folder in folders:
        photo_count = photo_count_by_gallery.get(folder.id, 0)
        total_listed_photos += photo_count
        total_size_bytes += total_size_by_gallery.get(folder.id, 0)
        cover_thumbnail_key = cover_thumbnail_by_photo_id.get(folder.cover_photo_id) if folder.cover_photo_id else None
        cover_thumbnail_url = thumbnail_url_map.get(cover_thumbnail_key) if cover_thumbnail_key else None
        if cover_thumbnail_url is None:
            recent_keys = recent_thumbnail_keys_by_gallery.get(folder.id, [])
            if recent_keys:
                cover_thumbnail_url = thumbnail_url_map.get(recent_keys[0])
        folder_items.append(
            PublicProjectFolder(
                folder_id=str(folder.id),
                folder_name=folder.name,
                photo_count=photo_count,
                cover_thumbnail_url=cover_thumbnail_url,
                route_path=f"/share/{share_id}/galleries/{folder.id}",
                direct_share_path=None,
            )
        )

    if record_view:
        client_ip = request.client.host if request.client else None
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
        total_listed_folders=len(folder_items),
        total_listed_photos=total_listed_photos,
        total_size_bytes=total_size_bytes,
        folders=folder_items,
    )


async def _load_project_zip_entries(
    project_id: UUID,
    *,
    project_repo: ProjectRepository,
    repo: ShareLinkRepository,
) -> list[tuple[str, list[Photo]]]:
    folders = await project_repo.get_visible_project_folders(project_id)
    if not folders:
        return []

    photos_by_gallery = await repo.get_photos_by_visible_project(project_id)
    return [(folder.name, photos_by_gallery.get(folder.id, [])) for folder in folders]


def _ensure_gallery_share_scope(sharelink: ShareLink) -> None:
    if sharelink.scope_type != ShareScopeType.GALLERY.value:
        raise HTTPException(status_code=404, detail="Gallery share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)


def _require_gallery_share_id(sharelink: ShareLink) -> UUID:
    _ensure_gallery_share_scope(sharelink)
    if sharelink.gallery_id is None:
        raise HTTPException(status_code=404, detail="Gallery not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink.gallery_id


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


@router.get("/{share_id}/folders/{folder_id}", response_model=PublicGalleryResponse)
@router.get("/{share_id}/galleries/{folder_id}", response_model=PublicGalleryResponse)
async def get_project_folder_by_sharelink(
    share_id: UUID,
    folder_id: UUID,
    request: Request,
    response: Response,
    limit: int | None = Query(None, ge=1, le=500, description="Limit number of photos to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> PublicGalleryResponse:
    if sharelink.scope_type != ShareScopeType.PROJECT.value or sharelink.project is None:
        raise HTTPException(status_code=404, detail="Project share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery = await project_repo.get_visible_project_folder_by_id(sharelink.project.id, folder_id)
    if gallery is None:
        logger.warning(
            "Denied hidden or missing folder access via project share",
            extra={"scope_type": "project", "share_id": str(share_id), "folder_id": str(folder_id)},
        )
        raise HTTPException(status_code=404, detail="Folder not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    record_project_view = request.headers.get(INTERNAL_PROJECT_NAVIGATION_HEADER) != "1"
    project_navigation = await _build_public_project_response(
        share_id=share_id,
        request=request,
        response=response,
        project_repo=project_repo,
        gallery_repo=gallery_repo,
        s3_client=s3_client,
        sharelink=sharelink,
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
    )


@router.get("/{share_id}/photos/by-ids", response_model=list[PublicPhoto])
async def get_public_photos_by_ids(
    share_id: UUID,
    response: Response,
    photo_ids: list[UUID] = Query(..., description="Ordered list of photo ids to resolve"),
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
    ordered_photos = [photo_map[photo_id] for photo_id in unique_photo_ids if photo_id in photo_map]

    if not ordered_photos:
        return []

    thumbnail_keys = [photo.thumbnail_object_key for photo in ordered_photos]
    thumb_url_map = await s3_client.generate_presigned_urls_batch(thumbnail_keys)
    full_url_map = await s3_client.generate_presigned_urls_batch_for_dispositions(
        {photo.object_key: _build_content_disposition(photo.display_name, disposition_type="inline") for photo in ordered_photos}
    )

    return [
        PublicPhoto(
            photo_id=str(photo.id),
            thumbnail_url=thumb_url_map.get(photo.thumbnail_object_key, ""),
            full_url=full_url_map.get(photo.object_key, ""),
            filename=photo.display_name,
        )
        for photo in ordered_photos
        if thumb_url_map.get(photo.thumbnail_object_key) and full_url_map.get(photo.object_key)
    ]


# intentionally not async
@router.get("/{share_id}/galleries/{folder_id}/download/all")
def download_project_gallery_photos_zip(
    share_id: UUID,
    folder_id: UUID,
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink: ShareLink = Depends(get_valid_sharelink),
) -> StreamingResponse:
    """Download one visible gallery from a project share as zip."""
    if sharelink.scope_type != ShareScopeType.PROJECT.value or sharelink.project_id is None:
        raise HTTPException(status_code=404, detail="Project share not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    gallery = asyncio_run(project_repo.get_visible_project_folder_by_id(sharelink.project_id, folder_id))
    if gallery is None:
        raise HTTPException(status_code=404, detail="Folder not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)

    settings = get_s3_settings()
    z = zipstream.ZipStream()
    used_names: set[str] = set()
    gallery_photos = asyncio_run(repo.get_photos_by_gallery_id(gallery.id))

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

    asyncio_run(repo.record_zip_download(share_id))
    logger.log_event(
        "download_project_gallery_zip",
        share_id=str(sharelink.id),
        extra={"gallery_id": str(gallery.id), "photo_count": len(gallery_photos)},
    )

    safe_gallery_name = sanitize_zip_entry_name(gallery.name or f"gallery_{folder_id}", fallback=f"gallery_{folder_id}")
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_gallery_name}.zip"',
        **PUBLIC_CACHE_CONTROL_HEADERS,
    }
    return StreamingResponse(z, media_type="application/zip", headers=headers)


# intetionally not async
@router.get("/{share_id}/download/all")
def download_all_photos_zip(
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
            raise HTTPException(status_code=404, detail="Project not found")
        project_zip_entries = asyncio_run(_load_project_zip_entries(project_id, project_repo=project_repo, repo=repo))
        if not any(folder_photos for _, folder_photos in project_zip_entries):
            raise HTTPException(status_code=404, detail="No photos found")

        for folder_name, folder_photos in project_zip_entries:
            for photo in folder_photos:
                key = photo.object_key
                fallback = build_zip_fallback_name(photo.display_name, object_key=key, fallback_stem=f"photo-{photo.id}")
                filename = sanitize_zip_entry_name(f"{folder_name} - {photo.display_name}", fallback=f"{folder_name} - {fallback}")
                filename = make_unique_zip_entry_name(filename, used_names)

                def file_generator(object_key: str = key):
                    client = get_s3_client()
                    obj = client.get_object(Bucket=settings.bucket, Key=object_key)
                    yield from iter(lambda: obj["Body"].read(1024 * 1024), b"")

                z.add(arcname=filename, data=file_generator())

        asyncio_run(repo.record_zip_download(share_id))
        headers = {
            "Content-Disposition": f'attachment; filename="project_{share_id}.zip"',
            **PUBLIC_CACHE_CONTROL_HEADERS,
        }
        return StreamingResponse(z, media_type="application/zip", headers=headers)

    gallery_id = _require_gallery_share_id(sharelink)
    gallery_photos = asyncio_run(repo.get_photos_by_gallery_id(gallery_id))

    with contextlib.suppress(Exception):
        gallery_photos = sorted(gallery_photos, key=lambda p: p.display_name.lower())

    if not gallery_photos:
        raise HTTPException(status_code=404, detail="No photos found")

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

    asyncio_run(repo.record_zip_download(share_id))
    logger.log_event("download_zip", share_id=str(sharelink.id), extra={"photo_count": len(gallery_photos)})

    headers = {
        "Content-Disposition": f'attachment; filename="gallery_{share_id}.zip"',
        **PUBLIC_CACHE_CONTROL_HEADERS,
    }

    return StreamingResponse(z, media_type="application/zip", headers=headers)
