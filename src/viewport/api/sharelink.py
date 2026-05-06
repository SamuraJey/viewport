from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import hash_password
from viewport.auth_utils import get_current_user
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.models.db import get_db
from viewport.models.sharelink import ShareLink
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
from viewport.selection_utils import EMPTY_SHARELINK_SELECTION_SUMMARY, ShareLinkSelectionSummaryAggregate, selection_rollup_status

gallery_router = APIRouter(prefix="/galleries/{gallery_id}/share-links", tags=["sharelinks"])
project_router = APIRouter(prefix="/projects/{project_id}/share-links", tags=["sharelinks"])
dashboard_router = APIRouter(prefix="/share-links", tags=["sharelinks"])
router = APIRouter(tags=["sharelinks"])

type DailyPointValues = tuple[int, int, int, int]


@dataclass(frozen=True, slots=True)
class PreparedShareLinkCreate:
    expires_at: datetime | None
    label: str | None
    is_active: bool
    password_hash: str | None


@dataclass(frozen=True, slots=True)
class PreparedShareLinkUpdate:
    fields_set: set[str]
    label: str | None
    expires_at: datetime | None
    is_active: bool | None
    password_hash: str | None
    password_clear: bool | None


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


async def _prepare_sharelink_create(req: ShareLinkCreateRequest) -> PreparedShareLinkCreate:
    return PreparedShareLinkCreate(
        expires_at=req.expires_at,
        label=_normalize_label(req.label),
        is_active=req.is_active,
        password_hash=await _hash_sharelink_password(req.password),
    )


async def _prepare_sharelink_update(req: ShareLinkUpdateRequest) -> PreparedShareLinkUpdate:
    update_data = req.model_dump(exclude_unset=True)
    if "label" in update_data:
        update_data["label"] = _normalize_label(update_data["label"])

    return PreparedShareLinkUpdate(
        fields_set=set(update_data.keys()),
        label=update_data.get("label"),
        expires_at=update_data.get("expires_at"),
        is_active=update_data.get("is_active"),
        password_hash=await _hash_sharelink_password(update_data.get("password")) if "password" in update_data else None,
        password_clear=update_data.get("password_clear"),
    )


def _to_selection_summary_response(
    summary: ShareLinkSelectionSummaryAggregate,
) -> ShareLinkSelectionSummaryResponse:
    return ShareLinkSelectionSummaryResponse(
        is_enabled=summary.is_enabled,
        status=selection_rollup_status(
            summary.total_sessions,
            summary.submitted_sessions,
            summary.in_progress_sessions,
            summary.closed_sessions,
        ),
        total_sessions=summary.total_sessions,
        submitted_sessions=summary.submitted_sessions,
        in_progress_sessions=summary.in_progress_sessions,
        closed_sessions=summary.closed_sessions,
        selected_count=summary.selected_count,
        latest_activity_at=summary.latest_activity_at,
    )


def _selection_summary_from_map(
    selection_summaries: Mapping[UUID, ShareLinkSelectionSummaryAggregate],
    sharelink_id: UUID,
) -> ShareLinkSelectionSummaryResponse:
    return _to_selection_summary_response(selection_summaries.get(sharelink_id, EMPTY_SHARELINK_SELECTION_SUMMARY))


def _scoped_sharelink_responses(
    sharelinks: list[ShareLink],
    selection_summaries: Mapping[UUID, ShareLinkSelectionSummaryAggregate],
) -> list[ScopedShareLinkResponse]:
    return [
        ScopedShareLinkResponse.model_validate(sharelink).model_copy(
            update={
                "selection_summary": _selection_summary_from_map(selection_summaries, sharelink.id),
            }
        )
        for sharelink in sharelinks
    ]


def _zero_filled_daily_points(
    stats_by_day: Mapping[date, DailyPointValues],
    *,
    days: int,
) -> list[ShareLinkDailyPointResponse]:
    start_day = datetime.now(UTC).date() - timedelta(days=days - 1)
    points: list[ShareLinkDailyPointResponse] = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        views_total, views_unique, zip_downloads, single_downloads = stats_by_day.get(day, (0, 0, 0, 0))
        points.append(
            ShareLinkDailyPointResponse(
                day=day,
                views_total=views_total,
                views_unique=views_unique,
                zip_downloads=zip_downloads,
                single_downloads=single_downloads,
            )
        )
    return points


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
    create_data = await _prepare_sharelink_create(req)
    sharelink = await repo.create_sharelink(
        gallery_id,
        create_data.expires_at,
        label=create_data.label,
        is_active=create_data.is_active,
        password_hash=create_data.password_hash,
    )
    return GalleryShareLinkResponse.model_validate(sharelink)


@gallery_router.patch("/{sharelink_id}", response_model=GalleryShareLinkResponse)
async def update_sharelink(
    gallery_id: UUID,
    sharelink_id: UUID,
    req: ShareLinkUpdateRequest,
    repo: GalleryRepository = Depends(get_gallery_repository),
    user=Depends(get_current_user),
) -> GalleryShareLinkResponse:
    update_data = await _prepare_sharelink_update(req)

    try:
        sharelink = await repo.update_sharelink(
            sharelink_id,
            gallery_id,
            user.id,
            fields_set=update_data.fields_set,
            label=update_data.label,
            expires_at=update_data.expires_at,
            is_active=update_data.is_active,
            password_hash=update_data.password_hash,
            password_clear=update_data.password_clear,
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
    return _scoped_sharelink_responses(sharelinks, selection_summaries)


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
    return _scoped_sharelink_responses(sharelinks, selection_summaries)


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
    create_data = await _prepare_sharelink_create(req)
    sharelink = await repo.create_project_sharelink(
        project_id,
        create_data.expires_at,
        label=create_data.label,
        is_active=create_data.is_active,
        password_hash=create_data.password_hash,
    )
    return ScopedShareLinkResponse.model_validate(sharelink)


@project_router.patch("/{sharelink_id}", response_model=ScopedShareLinkResponse)
async def update_project_sharelink(
    project_id: UUID,
    sharelink_id: UUID,
    req: ShareLinkUpdateRequest,
    repo: ProjectRepository = Depends(get_project_repository),
    user=Depends(get_current_user),
) -> ScopedShareLinkResponse:
    update_data = await _prepare_sharelink_update(req)

    try:
        sharelink = await repo.update_project_sharelink(
            sharelink_id,
            project_id,
            user.id,
            fields_set=update_data.fields_set,
            label=update_data.label,
            expires_at=update_data.expires_at,
            is_active=update_data.is_active,
            password_hash=update_data.password_hash,
            password_clear=update_data.password_clear,
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

    sharelink_ids = [sharelink.id for sharelink, _, _, _ in rows]
    selection_summaries = await selection_repo.get_sharelink_selection_summaries(sharelink_ids)
    thumbnail_keys_by_sharelink = await repo.get_owner_sharelink_cover_thumbnail_keys(
        sharelink_ids,
        user.id,
    )
    thumbnail_keys = list(dict.fromkeys(thumbnail_keys_by_sharelink.values()))
    thumbnail_urls_by_key = await s3_client.generate_presigned_urls_batch(thumbnail_keys, expires_in=7200) if thumbnail_keys else {}
    daily_stats_by_day = {row_day: (views_total, views_unique, zip_downloads, single_downloads) for row_day, views_total, views_unique, zip_downloads, single_downloads in daily_stats}

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
            latest_activity_at=latest_activity_at,
            selection_summary=_selection_summary_from_map(selection_summaries, sharelink.id),
        )
        for sharelink, gallery_name, project_name, latest_activity_at in rows
    ]

    return ShareLinkDashboardResponse(
        share_links=share_links,
        total=total,
        page=page,
        size=size,
        summary=ShareLinkDashboardSummaryResponse(**summary),
        points=_zero_filled_daily_points(daily_stats_by_day, days=30),
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
    stats_by_day = {point.day: (point.views_total, point.views_unique, point.zip_downloads, point.single_downloads) for point in stats}

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

    return ShareLinkAnalyticsResponse(
        share_link=share_link,
        selection_summary=_selection_summary_from_map(sharelink_selection_summaries, sharelink.id),
        points=_zero_filled_daily_points(stats_by_day, days=days),
    )


router.include_router(gallery_router)
router.include_router(project_router)
router.include_router(dashboard_router)
