from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import hash_password
from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.models.db import get_db
from viewport.models.sharelink_selection import SelectionSessionStatus
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.project_repository import ProjectRepository
from viewport.repositories.selection_repository import SelectionRepository
from viewport.repositories.sharelink_repository import ShareLinkRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.sharelink import (
    GalleryShareLinkResponse,
    ScopedShareLinkResponse,
    ShareLinkAnalyticsResponse,
    ShareLinkCreateRequest,
    ShareLinkDailyPointResponse,
    ShareLinkDashboardItemResponse,
    ShareLinkDashboardListItemResponse,
    ShareLinkDashboardResponse,
    ShareLinkDashboardSummaryResponse,
    ShareLinkSelectionSummaryResponse,
    ShareLinkUpdateRequest,
)

gallery_router = APIRouter(prefix="/galleries/{gallery_id}/share-links", tags=["sharelinks"])
project_router = APIRouter(prefix="/projects/{project_id}/share-links", tags=["sharelinks"])
dashboard_router = APIRouter(prefix="/share-links", tags=["sharelinks"])
router = APIRouter(tags=["sharelinks"])


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def get_project_repository(db: AsyncSession = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


def get_sharelink_repository(db: AsyncSession = Depends(get_db)) -> ShareLinkRepository:
    return ShareLinkRepository(db)


def get_selection_repository(db: AsyncSession = Depends(get_db)) -> SelectionRepository:
    return SelectionRepository(db)


async def _hash_sharelink_password(password: str | None) -> str | None:
    if password is None:
        return None
    return await run_in_threadpool(hash_password, password)


def _normalize_label(label: str | None) -> str | None:
    if label is None:
        return None
    normalized = label.strip()
    return normalized or None


def _selection_rollup_status(
    total_sessions: int,
    submitted_sessions: int,
    in_progress_sessions: int,
    closed_sessions: int,
) -> str:
    if total_sessions <= 0:
        return "not_started"
    if submitted_sessions > 0:
        return SelectionSessionStatus.SUBMITTED.value
    if in_progress_sessions > 0:
        return SelectionSessionStatus.IN_PROGRESS.value
    if closed_sessions > 0:
        return SelectionSessionStatus.CLOSED.value
    return "not_started"


def _to_selection_summary_response(
    is_enabled: bool,
    total_sessions: int,
    submitted_sessions: int,
    in_progress_sessions: int,
    closed_sessions: int,
    selected_count: int,
    latest_activity_at: datetime | None,
) -> ShareLinkSelectionSummaryResponse:
    return ShareLinkSelectionSummaryResponse(
        is_enabled=is_enabled,
        status=_selection_rollup_status(
            total_sessions,
            submitted_sessions,
            in_progress_sessions,
            closed_sessions,
        ),
        total_sessions=total_sessions,
        submitted_sessions=submitted_sessions,
        in_progress_sessions=in_progress_sessions,
        closed_sessions=closed_sessions,
        selected_count=selected_count,
        latest_activity_at=latest_activity_at,
    )


@gallery_router.get("", response_model=list[GalleryShareLinkResponse])
async def list_sharelinks(
    gallery_id: UUID,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user=Depends(get_current_user),
) -> list[GalleryShareLinkResponse]:
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    sharelinks = await repo.get_sharelinks_by_gallery(gallery_id, user.id)
    return [GalleryShareLinkResponse.model_validate(sharelink) for sharelink in sharelinks]


@gallery_router.post("", response_model=GalleryShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_sharelink(gallery_id: UUID, req: ShareLinkCreateRequest, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    gallery = await repo.get_gallery_by_id_and_owner(gallery_id, user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    password_hash = await _hash_sharelink_password(req.password)
    sharelink = await repo.create_sharelink(gallery_id, req.expires_at, label=_normalize_label(req.label), is_active=req.is_active, password_hash=password_hash)
    return GalleryShareLinkResponse.model_validate(sharelink)


@gallery_router.patch("/{sharelink_id}", response_model=GalleryShareLinkResponse)
async def update_sharelink(
    gallery_id: UUID,
    sharelink_id: UUID,
    req: ShareLinkUpdateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user=Depends(get_current_user),
) -> GalleryShareLinkResponse:
    update_data = req.model_dump(exclude_unset=True)
    if "label" in update_data:
        update_data["label"] = _normalize_label(update_data["label"])
    password_hash = await _hash_sharelink_password(update_data.get("password")) if "password" in update_data else None

    try:
        sharelink = await repo.update_sharelink(
            sharelink_id,
            gallery_id,
            user.id,
            fields_set=set(update_data.keys()),
            label=update_data.get("label"),
            expires_at=update_data.get("expires_at"),
            is_active=update_data.get("is_active"),
            password_hash=password_hash,
            password_clear=update_data.get("password_clear"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")
    return GalleryShareLinkResponse.model_validate(sharelink)


@gallery_router.delete("/{sharelink_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sharelink(gallery_id: UUID, sharelink_id: UUID, repo: GalleryRepository = Depends(get_gallery_repository), user=Depends(get_current_user)):
    if not await repo.delete_sharelink(sharelink_id, gallery_id, user.id):
        raise HTTPException(status_code=404, detail="Share link not found")
    return


@project_router.get("", response_model=list[ScopedShareLinkResponse])
async def list_project_sharelinks(
    project_id: UUID,
    repo: ProjectRepository = Depends(get_project_repository),
    selection_repo: SelectionRepository = Depends(get_selection_repository),
    user=Depends(get_current_user),
) -> list[ScopedShareLinkResponse]:
    project = await repo.get_project_by_id_and_owner(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sharelinks = await repo.get_sharelinks_by_project(project_id, user.id)
    selection_summaries = await selection_repo.get_sharelink_selection_summaries(
        [sharelink.id for sharelink in sharelinks],
    )
    empty_selection_summary = (False, 0, 0, 0, 0, 0, None)
    return [
        ScopedShareLinkResponse.model_validate(sharelink).model_copy(
            update={
                "selection_summary": _to_selection_summary_response(*selection_summaries.get(sharelink.id, empty_selection_summary)),
            }
        )
        for sharelink in sharelinks
    ]


@project_router.get("/warnings", response_model=list[ScopedShareLinkResponse])
async def list_project_warning_sharelinks(
    project_id: UUID,
    project_repo: ProjectRepository = Depends(get_project_repository),
    sharelink_repo: ShareLinkRepository = Depends(get_sharelink_repository),
    selection_repo: SelectionRepository = Depends(get_selection_repository),
    user=Depends(get_current_user),
) -> list[ScopedShareLinkResponse]:
    project = await project_repo.get_project_by_id_and_owner(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sharelinks = await sharelink_repo.get_sharelinks_for_project_warnings(project_id, user.id)
    selection_summaries = await selection_repo.get_sharelink_selection_summaries(
        [sharelink.id for sharelink in sharelinks],
    )
    empty_selection_summary = (False, 0, 0, 0, 0, 0, None)
    return [
        ScopedShareLinkResponse.model_validate(sharelink).model_copy(
            update={
                "selection_summary": _to_selection_summary_response(
                    *selection_summaries.get(sharelink.id, empty_selection_summary),
                ),
            }
        )
        for sharelink in sharelinks
    ]


@project_router.post("", response_model=ScopedShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_project_sharelink(
    project_id: UUID,
    req: ShareLinkCreateRequest,
    repo: ProjectRepository = Depends(get_project_repository),
    user=Depends(get_current_user),
) -> ScopedShareLinkResponse:
    project = await repo.get_project_by_id_and_owner(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    password_hash = await _hash_sharelink_password(req.password)
    sharelink = await repo.create_project_sharelink(project_id, req.expires_at, label=_normalize_label(req.label), is_active=req.is_active, password_hash=password_hash)
    return ScopedShareLinkResponse.model_validate(sharelink)


@project_router.patch("/{sharelink_id}", response_model=ScopedShareLinkResponse)
async def update_project_sharelink(
    project_id: UUID,
    sharelink_id: UUID,
    req: ShareLinkUpdateRequest,
    repo: ProjectRepository = Depends(get_project_repository),
    user=Depends(get_current_user),
) -> ScopedShareLinkResponse:
    update_data = req.model_dump(exclude_unset=True)
    if "label" in update_data:
        update_data["label"] = _normalize_label(update_data["label"])
    password_hash = await _hash_sharelink_password(update_data.get("password")) if "password" in update_data else None

    try:
        sharelink = await repo.update_project_sharelink(
            sharelink_id,
            project_id,
            user.id,
            fields_set=set(update_data.keys()),
            label=update_data.get("label"),
            expires_at=update_data.get("expires_at"),
            is_active=update_data.get("is_active"),
            password_hash=password_hash,
            password_clear=update_data.get("password_clear"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")
    return ScopedShareLinkResponse.model_validate(sharelink)


@project_router.delete("/{sharelink_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_sharelink(
    project_id: UUID,
    sharelink_id: UUID,
    repo: ProjectRepository = Depends(get_project_repository),
    user=Depends(get_current_user),
):
    if not await repo.delete_project_sharelink(sharelink_id, project_id, user.id):
        raise HTTPException(status_code=404, detail="Share link not found")
    return


@dashboard_router.get("", response_model=ShareLinkDashboardResponse)
async def list_owner_sharelinks(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=127),
    status_filter: Literal["active", "inactive", "expired"] | None = Query(
        None,
        alias="status",
    ),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    selection_repo: SelectionRepository = Depends(get_selection_repository),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
    user=Depends(get_current_user),
) -> ShareLinkDashboardResponse:
    rows, total, summary = await repo.get_sharelinks_by_owner(
        user.id,
        page=page,
        size=size,
        search=search,
        status=status_filter,
    )
    daily_stats = await repo.get_owner_sharelink_daily_stats(
        user.id,
        days=30,
        search=search,
        status=status_filter,
    )

    sharelink_ids = [sharelink.id for sharelink, _, _ in rows]
    selection_summaries = await selection_repo.get_sharelink_selection_summaries(sharelink_ids)
    empty_selection_summary = (False, 0, 0, 0, 0, 0, None)
    thumbnail_keys_by_sharelink = await repo.get_owner_sharelink_cover_thumbnail_keys(
        sharelink_ids,
        user.id,
    )
    thumbnail_keys = list(dict.fromkeys(thumbnail_keys_by_sharelink.values()))
    thumbnail_urls_by_key = await s3_client.generate_presigned_urls_batch(thumbnail_keys, expires_in=7200) if thumbnail_keys else {}
    daily_stats_by_day = {row[0]: row for row in daily_stats}
    start_day = datetime.now(UTC).date() - timedelta(days=29)
    points = []
    for offset in range(30):
        day = start_day + timedelta(days=offset)
        stat = daily_stats_by_day.get(day)
        points.append(
            ShareLinkDailyPointResponse(
                day=day,
                views_total=stat[1] if stat else 0,
                views_unique=stat[2] if stat else 0,
                zip_downloads=stat[3] if stat else 0,
                single_downloads=stat[4] if stat else 0,
            )
        )

    share_links = [
        ShareLinkDashboardListItemResponse(
            id=sharelink.id,
            scope_type=sharelink.scope_type,
            gallery_id=sharelink.gallery_id,
            project_id=sharelink.project_id,
            gallery_name=gallery_name,
            project_name=project_name,
            cover_photo_thumbnail_url=thumbnail_urls_by_key.get(
                thumbnail_keys_by_sharelink[sharelink.id],
            )
            if sharelink.id in thumbnail_keys_by_sharelink
            else None,
            label=sharelink.label,
            is_active=sharelink.is_active,
            expires_at=sharelink.expires_at,
            views=sharelink.views,
            zip_downloads=sharelink.zip_downloads,
            single_downloads=sharelink.single_downloads,
            has_password=sharelink.has_password,
            created_at=sharelink.created_at,
            updated_at=sharelink.updated_at,
            selection_summary=_to_selection_summary_response(*selection_summaries.get(sharelink.id, empty_selection_summary)),
        )
        for sharelink, gallery_name, project_name in rows
    ]

    return ShareLinkDashboardResponse(
        share_links=share_links,
        total=total,
        page=page,
        size=size,
        summary=ShareLinkDashboardSummaryResponse(**summary),
        points=points,
    )


@dashboard_router.get("/{sharelink_id}/analytics", response_model=ShareLinkAnalyticsResponse)
async def get_sharelink_analytics(
    sharelink_id: UUID,
    days: int = Query(30, ge=1, le=365),
    repo: ShareLinkRepository = Depends(get_sharelink_repository),
    selection_repo: SelectionRepository = Depends(get_selection_repository),
    user=Depends(get_current_user),
) -> ShareLinkAnalyticsResponse:
    row = await repo.get_sharelink_for_owner(sharelink_id, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Share link not found")

    sharelink, gallery_name, project_name = row
    stats = await repo.get_sharelink_daily_stats(sharelink_id, days=days)
    points_by_day = {point.day: point for point in stats}

    start_day = datetime.now(UTC).date() - timedelta(days=days - 1)
    points = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        stat = points_by_day.get(day)
        points.append(
            ShareLinkDailyPointResponse(
                day=day,
                views_total=stat.views_total if stat else 0,
                views_unique=stat.views_unique if stat else 0,
                zip_downloads=stat.zip_downloads if stat else 0,
                single_downloads=stat.single_downloads if stat else 0,
            )
        )

    share_link = ShareLinkDashboardItemResponse(
        id=sharelink.id,
        scope_type=sharelink.scope_type,
        gallery_id=sharelink.gallery_id,
        project_id=sharelink.project_id,
        gallery_name=gallery_name,
        project_name=project_name,
        label=sharelink.label,
        is_active=sharelink.is_active,
        expires_at=sharelink.expires_at,
        views=sharelink.views,
        zip_downloads=sharelink.zip_downloads,
        single_downloads=sharelink.single_downloads,
        has_password=sharelink.has_password,
        created_at=sharelink.created_at,
        updated_at=sharelink.updated_at,
    )

    sharelink_selection_summaries = await selection_repo.get_sharelink_selection_summaries([sharelink.id])
    selection_summary = _to_selection_summary_response(*sharelink_selection_summaries.get(sharelink.id, (False, 0, 0, 0, 0, 0, None)))

    return ShareLinkAnalyticsResponse(
        share_link=share_link,
        selection_summary=selection_summary,
        points=points,
    )


router.include_router(gallery_router)
router.include_router(project_router)
router.include_router(dashboard_router)
