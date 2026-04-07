import csv
import io
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.auth_utils import get_current_user
from viewport.background_tasks import notify_selection_submitted_task
from viewport.dependencies import get_s3_client
from viewport.models.db import get_db
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_selection import SelectionSessionStatus, ShareLinkSelectionConfig, ShareLinkSelectionItem, ShareLinkSelectionSession
from viewport.models.user import User
from viewport.repositories.selection_repository import SelectionRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.selection import (
    BulkSelectionActionResponse,
    OwnerSelectionAggregateResponse,
    OwnerSelectionDetailResponse,
    OwnerSelectionRowResponse,
    OwnerSelectionSessionListItemResponse,
    SelectionConfigResponse,
    SelectionConfigUpdateRequest,
    SelectionItemResponse,
    SelectionPhotoCommentRequest,
    SelectionSessionResponse,
    SelectionSessionStartRequest,
    SelectionSessionUpdateRequest,
    SelectionSubmitResponse,
    SelectionTogglePhotoResponse,
)
from viewport.sharelink_utils import is_sharelink_expired

router = APIRouter(tags=["selection"])

PUBLIC_CACHE_CONTROL_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
SELECTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
SELECTION_COOKIE_PREFIX = "viewport-selection-resume-"
LIGHTROOM_SEPARATOR = "|"


def get_selection_repository(db: AsyncSession = Depends(get_db)) -> SelectionRepository:
    return SelectionRepository(db)


def _selection_cookie_name(share_id: uuid.UUID) -> str:
    return f"{SELECTION_COOKIE_PREFIX}{share_id}"


def _selection_cookie_path(share_id: uuid.UUID) -> str:
    return f"/s/{share_id}"


def _should_use_secure_selection_cookie(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto:
        return forwarded_proto.split(",")[0].strip().lower() == "https"
    return request.url.scheme == "https"


def _set_selection_cookie(request: Request, response: Response, share_id: uuid.UUID, token: str) -> None:
    response.set_cookie(
        key=_selection_cookie_name(share_id),
        value=token,
        max_age=SELECTION_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_should_use_secure_selection_cookie(request),
        path=_selection_cookie_path(share_id),
    )


def _get_selection_resume_token(request: Request, share_id: uuid.UUID, resume_token: str | None) -> str | None:
    if resume_token and resume_token.strip():
        return resume_token.strip()
    cookie_name = _selection_cookie_name(share_id)
    cookie_value = request.cookies.get(cookie_name)
    if cookie_value and cookie_value.strip():
        return cookie_value.strip()
    return None


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _validate_contact_requirements(config: ShareLinkSelectionConfig, payload: SelectionSessionStartRequest) -> tuple[str, str | None, str | None, str | None]:
    client_name = payload.client_name.strip()
    if not client_name:
        raise HTTPException(status_code=422, detail="client_name is required")

    client_email = _normalize_optional_text(str(payload.client_email) if payload.client_email is not None else None)
    client_phone = _normalize_optional_text(payload.client_phone)
    client_note = _normalize_optional_text(payload.client_note)

    if config.require_email and not client_email:
        raise HTTPException(status_code=422, detail="client_email is required")
    if config.require_phone and not client_phone:
        raise HTTPException(status_code=422, detail="client_phone is required")
    if config.require_client_note and not client_note:
        raise HTTPException(status_code=422, detail="client_note is required")

    return client_name, client_email, client_phone, client_note


def _validate_session_mutable(session: ShareLinkSelectionSession) -> None:
    if session.status == SelectionSessionStatus.CLOSED.value:
        raise HTTPException(status_code=409, detail="Selection is closed by photographer")
    if session.status == SelectionSessionStatus.SUBMITTED.value:
        raise HTTPException(status_code=409, detail="Selection is already submitted")


def _validate_submit_requirements(config: ShareLinkSelectionConfig, session: ShareLinkSelectionSession) -> None:
    if config.require_email and not _normalize_optional_text(session.client_email):
        raise HTTPException(status_code=422, detail="client_email is required")
    if config.require_phone and not _normalize_optional_text(session.client_phone):
        raise HTTPException(status_code=422, detail="client_phone is required")
    if config.require_client_note and not _normalize_optional_text(session.client_note):
        raise HTTPException(status_code=422, detail="client_note is required")
    if config.limit_enabled and config.limit_value is not None and session.selected_count > config.limit_value:
        raise HTTPException(status_code=422, detail=f"Selected photos exceed the limit ({config.limit_value})")
    if session.selected_count <= 0:
        raise HTTPException(status_code=422, detail="At least one photo must be selected before submit")


def _to_selection_item_response(item: ShareLinkSelectionItem, thumbnail_url_map: dict[str, str] | None = None) -> SelectionItemResponse:
    photo_display_name: str | None = None
    photo_thumbnail_url: str | None = None
    if "photo" in item.__dict__ and item.photo is not None:
        photo_display_name = item.photo.display_name
        thumbnail_object_key = item.photo.thumbnail_object_key
        if thumbnail_url_map is not None:
            photo_thumbnail_url = thumbnail_url_map.get(thumbnail_object_key)

    return SelectionItemResponse(
        photo_id=str(item.photo_id),
        photo_display_name=photo_display_name,
        photo_thumbnail_url=photo_thumbnail_url,
        comment=item.comment,
        selected_at=item.selected_at,
        updated_at=item.updated_at,
    )


def _to_selection_config_response(config: ShareLinkSelectionConfig) -> SelectionConfigResponse:
    return SelectionConfigResponse(
        is_enabled=config.is_enabled,
        list_title=config.list_title,
        limit_enabled=config.limit_enabled,
        limit_value=config.limit_value,
        allow_photo_comments=config.allow_photo_comments,
        require_name=config.require_name,
        require_email=config.require_email,
        require_phone=config.require_phone,
        require_client_note=config.require_client_note,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


async def _to_selection_session_response(
    session: ShareLinkSelectionSession,
    *,
    resume_token: str | None = None,
    s3_client: AsyncS3Client | None = None,
) -> SelectionSessionResponse:
    ordered_items = sorted(session.items, key=lambda item: (item.selected_at, item.photo_id))
    thumbnail_url_map: dict[str, str] | None = None
    if s3_client is not None:
        thumbnail_keys = [item.photo.thumbnail_object_key for item in ordered_items if "photo" in item.__dict__ and item.photo is not None and item.photo.thumbnail_object_key]
        if thumbnail_keys:
            unique_thumbnail_keys = list(dict.fromkeys(thumbnail_keys))
            thumbnail_url_map = await s3_client.generate_presigned_urls_batch(
                unique_thumbnail_keys,
                expires_in=7200,
            )

    return SelectionSessionResponse(
        id=str(session.id),
        sharelink_id=str(session.sharelink_id),
        status=session.status,
        client_name=session.client_name,
        client_email=session.client_email,
        client_phone=session.client_phone,
        client_note=session.client_note,
        selected_count=session.selected_count,
        submitted_at=session.submitted_at,
        last_activity_at=session.last_activity_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
        resume_token=resume_token,
        items=[_to_selection_item_response(item, thumbnail_url_map) for item in ordered_items],
    )


def _to_owner_selection_session_list_item_response(session: ShareLinkSelectionSession) -> OwnerSelectionSessionListItemResponse:
    return OwnerSelectionSessionListItemResponse(
        id=str(session.id),
        status=session.status,
        client_name=session.client_name,
        client_email=session.client_email,
        client_phone=session.client_phone,
        client_note=session.client_note,
        selected_count=session.selected_count,
        submitted_at=session.submitted_at,
        last_activity_at=session.last_activity_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _to_owner_selection_aggregate_response(
    total_sessions: int,
    submitted_sessions: int,
    in_progress_sessions: int,
    closed_sessions: int,
    selected_count: int,
    latest_activity_at: datetime | None,
) -> OwnerSelectionAggregateResponse:
    return OwnerSelectionAggregateResponse(
        total_sessions=total_sessions,
        submitted_sessions=submitted_sessions,
        in_progress_sessions=in_progress_sessions,
        closed_sessions=closed_sessions,
        selected_count=selected_count,
        latest_activity_at=latest_activity_at,
    )


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


async def _get_public_sharelink_or_404(share_id: uuid.UUID, repo: SelectionRepository) -> ShareLink:
    sharelink = await repo.get_public_sharelink(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if not sharelink.is_active:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if is_sharelink_expired(sharelink.expires_at):
        raise HTTPException(status_code=410, detail="ShareLink expired", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink


async def _get_enabled_selection_config_or_404(sharelink_id: uuid.UUID, repo: SelectionRepository) -> ShareLinkSelectionConfig:
    config = await repo.get_or_create_config(sharelink_id)
    if not config.is_enabled:
        raise HTTPException(status_code=404, detail="Selection is not enabled", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return config


async def _get_session_by_token_or_404(
    *,
    request: Request,
    share_id: uuid.UUID,
    repo: SelectionRepository,
    resume_token: str | None,
) -> tuple[ShareLinkSelectionSession, str]:
    token = _get_selection_resume_token(request, share_id, resume_token)
    if not token:
        raise HTTPException(status_code=404, detail="Selection session not found")

    session = await repo.get_session_by_resume_token(share_id, token)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")
    return session, token


def _csv_response(filename: str, headers: list[str], rows: list[list[str]]) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/s/{share_id}/selection/config", response_model=SelectionConfigResponse)
async def get_public_selection_config(
    share_id: uuid.UUID,
    response: Response,
    repo: SelectionRepository = Depends(get_selection_repository),
) -> SelectionConfigResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)
    return _to_selection_config_response(config)


@router.post("/s/{share_id}/selection/session", response_model=SelectionSessionResponse)
async def start_public_selection_session(
    share_id: uuid.UUID,
    req: SelectionSessionStartRequest,
    request: Request,
    response: Response,
    repo: SelectionRepository = Depends(get_selection_repository),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)

    client_name, client_email, client_phone, client_note = _validate_contact_requirements(config, req)

    token_from_request = _get_selection_resume_token(request, share_id, None)
    if token_from_request:
        existing_by_token = await repo.get_session_by_resume_token(sharelink.id, token_from_request)
        if existing_by_token:
            _set_selection_cookie(request, response, share_id, token_from_request)
            return await _to_selection_session_response(
                existing_by_token,
                resume_token=token_from_request,
                s3_client=s3_client,
            )

    resume_token, resume_token_hash = repo.generate_resume_token()
    session = await repo.create_session(
        sharelink.id,
        config.id,
        client_name=client_name,
        client_email=client_email,
        client_phone=client_phone,
        client_note=client_note,
        resume_token_hash=resume_token_hash,
    )
    _set_selection_cookie(request, response, share_id, resume_token)
    return await _to_selection_session_response(
        session,
        resume_token=resume_token,
        s3_client=s3_client,
    )


@router.get("/s/{share_id}/selection/session/me", response_model=SelectionSessionResponse)
async def get_public_selection_session(
    share_id: uuid.UUID,
    request: Request,
    response: Response,
    resume_token: str | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    await _get_enabled_selection_config_or_404(sharelink.id, repo)

    session, resolved_token = await _get_session_by_token_or_404(request=request, share_id=share_id, repo=repo, resume_token=resume_token)
    _set_selection_cookie(request, response, share_id, resolved_token)
    return await _to_selection_session_response(
        session,
        resume_token=resolved_token,
        s3_client=s3_client,
    )


@router.put("/s/{share_id}/selection/session/items/{photo_id}", response_model=SelectionTogglePhotoResponse)
async def toggle_public_selection_item(
    share_id: uuid.UUID,
    photo_id: uuid.UUID,
    request: Request,
    response: Response,
    resume_token: str | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
) -> SelectionTogglePhotoResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)
    session, resolved_token = await _get_session_by_token_or_404(request=request, share_id=share_id, repo=repo, resume_token=resume_token)
    _set_selection_cookie(request, response, share_id, resolved_token)
    _validate_session_mutable(session)

    if not await repo.validate_photo_belongs_to_share_gallery(sharelink.id, photo_id):
        raise HTTPException(status_code=404, detail="Photo not found for this share link")

    existing_item = await repo.get_selection_item(session.id, photo_id)
    if existing_item:
        await repo.delete_selection_item(session.id, photo_id)
        selected = False
    else:
        if config.limit_enabled and config.limit_value is not None and session.selected_count >= config.limit_value:
            raise HTTPException(status_code=409, detail=f"Selection limit reached ({config.limit_value})")
        await repo.upsert_selection_item(session.id, photo_id)
        selected = True

    selected_count = await repo.refresh_selected_count(session)
    return SelectionTogglePhotoResponse(
        selected=selected,
        selected_count=selected_count,
        limit_enabled=config.limit_enabled,
        limit_value=config.limit_value,
    )


@router.patch("/s/{share_id}/selection/session/items/{photo_id}", response_model=SelectionItemResponse)
async def update_public_selection_item_comment(
    share_id: uuid.UUID,
    photo_id: uuid.UUID,
    req: SelectionPhotoCommentRequest,
    request: Request,
    response: Response,
    resume_token: str | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
) -> SelectionItemResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)
    if not config.allow_photo_comments:
        raise HTTPException(status_code=403, detail="Photo comments are disabled")

    session, resolved_token = await _get_session_by_token_or_404(request=request, share_id=share_id, repo=repo, resume_token=resume_token)
    _set_selection_cookie(request, response, share_id, resolved_token)
    _validate_session_mutable(session)

    if not await repo.validate_photo_belongs_to_share_gallery(sharelink.id, photo_id):
        raise HTTPException(status_code=404, detail="Photo not found for this share link")

    existing_item = await repo.get_selection_item(session.id, photo_id)
    if not existing_item:
        raise HTTPException(status_code=404, detail="Photo is not selected")

    comment = _normalize_optional_text(req.comment)
    item = await repo.upsert_selection_item(session.id, photo_id, comment=comment)
    await repo.touch_session(session)
    return _to_selection_item_response(item)


@router.patch("/s/{share_id}/selection/session", response_model=SelectionSessionResponse)
async def update_public_selection_session(
    share_id: uuid.UUID,
    req: SelectionSessionUpdateRequest,
    request: Request,
    response: Response,
    resume_token: str | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)

    session, resolved_token = await _get_session_by_token_or_404(request=request, share_id=share_id, repo=repo, resume_token=resume_token)
    _set_selection_cookie(request, response, share_id, resolved_token)
    _validate_session_mutable(session)

    client_note = _normalize_optional_text(req.client_note)
    if config.require_client_note and not client_note:
        raise HTTPException(status_code=422, detail="client_note is required")

    updated_session = await repo.update_session_note(session, client_note)
    return await _to_selection_session_response(
        updated_session,
        resume_token=resolved_token,
        s3_client=s3_client,
    )


@router.post("/s/{share_id}/selection/session/submit", response_model=SelectionSubmitResponse)
async def submit_public_selection_session(
    share_id: uuid.UUID,
    request: Request,
    response: Response,
    resume_token: str | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
) -> SelectionSubmitResponse:
    response.headers.update(PUBLIC_CACHE_CONTROL_HEADERS)
    sharelink = await _get_public_sharelink_or_404(share_id, repo)
    config = await _get_enabled_selection_config_or_404(sharelink.id, repo)

    session, resolved_token = await _get_session_by_token_or_404(request=request, share_id=share_id, repo=repo, resume_token=resume_token)
    _set_selection_cookie(request, response, share_id, resolved_token)

    if session.status == SelectionSessionStatus.CLOSED.value:
        raise HTTPException(status_code=409, detail="Selection is closed by photographer")

    if session.status == SelectionSessionStatus.SUBMITTED.value and session.submitted_at is not None:
        return SelectionSubmitResponse(
            status=session.status,
            selected_count=session.selected_count,
            submitted_at=session.submitted_at,
            notification_enqueued=False,
        )

    refreshed_count = await repo.refresh_selected_count(session)
    session.selected_count = refreshed_count
    _validate_submit_requirements(config, session)

    submitted_session = await repo.submit_session(session)
    notification_payload = {
        "sharelink_id": str(sharelink.id),
        "session_id": str(submitted_session.id),
        "client_name": submitted_session.client_name,
        "client_email": submitted_session.client_email,
        "selected_count": submitted_session.selected_count,
        "submitted_at": submitted_session.submitted_at.isoformat() if submitted_session.submitted_at else datetime.now(UTC).isoformat(),
    }
    notification_enqueued = True
    try:
        await run_in_threadpool(notify_selection_submitted_task.delay, notification_payload)
    except Exception:
        notification_enqueued = False

    return SelectionSubmitResponse(
        status=submitted_session.status,
        selected_count=submitted_session.selected_count,
        submitted_at=submitted_session.submitted_at or datetime.now(UTC),
        notification_enqueued=notification_enqueued,
    )


@router.get("/galleries/{gallery_id}/share-links/{sharelink_id}/selection-config", response_model=SelectionConfigResponse)
async def get_owner_selection_config(
    gallery_id: uuid.UUID,
    sharelink_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> SelectionConfigResponse:
    sharelink = await repo.get_sharelink_for_gallery_owner(gallery_id, sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    config = await repo.get_or_create_config(sharelink.id)
    return _to_selection_config_response(config)


@router.patch("/galleries/{gallery_id}/share-links/{sharelink_id}/selection-config", response_model=SelectionConfigResponse)
async def update_owner_selection_config(
    gallery_id: uuid.UUID,
    sharelink_id: uuid.UUID,
    req: SelectionConfigUpdateRequest,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> SelectionConfigResponse:
    sharelink = await repo.get_sharelink_for_gallery_owner(gallery_id, sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    payload = req.model_dump(exclude_unset=True)
    existing = await repo.get_or_create_config(sharelink.id)

    if payload.get("limit_enabled") is True and "limit_value" not in payload and existing.limit_value is None:
        raise HTTPException(status_code=422, detail="limit_value is required when limit_enabled is true")
    if payload.get("limit_enabled") is False and payload.get("limit_value") is not None:
        raise HTTPException(status_code=422, detail="limit_value must not be provided when limit_enabled is false")

    try:
        config = await repo.update_config(
            sharelink.id,
            fields_set=set(payload.keys()),
            is_enabled=payload.get("is_enabled"),
            list_title=payload.get("list_title"),
            limit_enabled=payload.get("limit_enabled"),
            limit_value=payload.get("limit_value"),
            allow_photo_comments=payload.get("allow_photo_comments"),
            require_email=payload.get("require_email"),
            require_phone=payload.get("require_phone"),
            require_client_note=payload.get("require_client_note"),
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=422, detail="Invalid selection configuration") from exc

    return _to_selection_config_response(config)


@router.get("/share-links/{sharelink_id}/selection", response_model=OwnerSelectionDetailResponse)
async def get_owner_selection_detail(
    sharelink_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> OwnerSelectionDetailResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    config = await repo.get_or_create_config(sharelink.id)
    sessions = await repo.list_sessions_for_sharelink(sharelink.id)
    session = sessions[0] if sessions else None
    (
        total_sessions,
        submitted_sessions,
        in_progress_sessions,
        closed_sessions,
        selected_count,
        latest_activity_at,
    ) = await repo.get_sharelink_session_aggregate(sharelink.id)

    return OwnerSelectionDetailResponse(
        sharelink_id=str(sharelink.id),
        sharelink_label=sharelink.label,
        config=_to_selection_config_response(config),
        aggregate=_to_owner_selection_aggregate_response(
            total_sessions,
            submitted_sessions,
            in_progress_sessions,
            closed_sessions,
            selected_count,
            latest_activity_at,
        ),
        sessions=[_to_owner_selection_session_list_item_response(item) for item in sessions],
        session=await _to_selection_session_response(session, s3_client=s3_client) if session else None,
    )


@router.post("/share-links/{sharelink_id}/selection/close", response_model=SelectionSessionResponse)
async def close_owner_selection(
    sharelink_id: uuid.UUID,
    session_id: uuid.UUID | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    if session_id is not None:
        session = await repo.get_session_by_id_for_sharelink(sharelink.id, session_id)
    else:
        session = await repo.get_latest_session_for_sharelink(sharelink.id)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")

    updated_session = await repo.set_session_status(session, SelectionSessionStatus.CLOSED)
    return await _to_selection_session_response(updated_session, s3_client=s3_client)


@router.post("/share-links/{sharelink_id}/selection/reopen", response_model=SelectionSessionResponse)
async def reopen_owner_selection(
    sharelink_id: uuid.UUID,
    session_id: uuid.UUID | None = Query(None),
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    if session_id is not None:
        session = await repo.get_session_by_id_for_sharelink(sharelink.id, session_id)
    else:
        session = await repo.get_latest_session_for_sharelink(sharelink.id)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")

    updated_session = await repo.set_session_status(session, SelectionSessionStatus.IN_PROGRESS)
    return await _to_selection_session_response(updated_session, s3_client=s3_client)


@router.get("/share-links/{sharelink_id}/selection/sessions/{session_id}", response_model=SelectionSessionResponse)
async def get_owner_selection_session_detail(
    sharelink_id: uuid.UUID,
    session_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    session = await repo.get_session_by_id_for_sharelink(sharelink.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")
    return await _to_selection_session_response(session, s3_client=s3_client)


@router.post("/share-links/{sharelink_id}/selection/sessions/{session_id}/close", response_model=SelectionSessionResponse)
async def close_owner_selection_session(
    sharelink_id: uuid.UUID,
    session_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    session = await repo.get_session_by_id_for_sharelink(sharelink.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")

    updated_session = await repo.set_session_status(session, SelectionSessionStatus.CLOSED)
    return await _to_selection_session_response(updated_session, s3_client=s3_client)


@router.post("/share-links/{sharelink_id}/selection/sessions/{session_id}/reopen", response_model=SelectionSessionResponse)
async def reopen_owner_selection_session(
    sharelink_id: uuid.UUID,
    session_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_s3_client),
) -> SelectionSessionResponse:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    session = await repo.get_session_by_id_for_sharelink(sharelink.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Selection session not found")

    updated_session = await repo.set_session_status(session, SelectionSessionStatus.IN_PROGRESS)
    return await _to_selection_session_response(updated_session, s3_client=s3_client)


@router.get("/galleries/{gallery_id}/selections", response_model=list[OwnerSelectionRowResponse])
async def get_gallery_selections(
    gallery_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> list[OwnerSelectionRowResponse]:
    if not await repo.gallery_exists_for_owner(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    rows = await repo.get_gallery_sharelinks_with_sessions(gallery_id, current_user.id)
    aggregates = await repo.get_gallery_session_aggregates(gallery_id, current_user.id)
    return [
        OwnerSelectionRowResponse(
            sharelink_id=str(sharelink.id),
            sharelink_label=sharelink.label,
            session_id=str(session.id) if session else None,
            status=_selection_rollup_status(aggregate[0], aggregate[1], aggregate[2], aggregate[3]) if aggregate is not None else None,
            client_name=session.client_name if session else None,
            selected_count=aggregate[4] if aggregate is not None else 0,
            session_count=aggregate[0] if aggregate is not None else 0,
            submitted_sessions=aggregate[1] if aggregate is not None else 0,
            in_progress_sessions=aggregate[2] if aggregate is not None else 0,
            closed_sessions=aggregate[3] if aggregate is not None else 0,
            submitted_at=session.submitted_at if session else None,
            updated_at=aggregate[5] if aggregate is not None and aggregate[5] is not None else (session.updated_at if session else sharelink.updated_at),
        )
        for sharelink, session in rows
        for aggregate in [aggregates.get(sharelink.id)]
    ]


@router.post("/galleries/{gallery_id}/selections/actions/close-all", response_model=BulkSelectionActionResponse)
async def close_all_gallery_selections(
    gallery_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> BulkSelectionActionResponse:
    if not await repo.gallery_exists_for_owner(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    affected_count = await repo.close_all_for_gallery(gallery_id, current_user.id)
    return BulkSelectionActionResponse(affected_count=affected_count)


@router.post("/galleries/{gallery_id}/selections/actions/open-all", response_model=BulkSelectionActionResponse)
async def reopen_all_gallery_selections(
    gallery_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> BulkSelectionActionResponse:
    if not await repo.gallery_exists_for_owner(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    affected_count = await repo.reopen_all_for_gallery(gallery_id, current_user.id)
    return BulkSelectionActionResponse(affected_count=affected_count)


@router.get("/share-links/{sharelink_id}/selection/export/files.csv")
async def export_sharelink_selection_files_csv(
    sharelink_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> Response:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    items = await repo.get_selected_items_for_sharelink(sharelink.id)
    rows = [[filename, comment or ""] for filename, comment in items]
    filename = f"selection_{sharelink.id}_files.csv"
    return _csv_response(filename, ["filename", "comment"], rows)


@router.get("/share-links/{sharelink_id}/selection/export/lightroom.txt")
async def export_sharelink_selection_lightroom(
    sharelink_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> Response:
    sharelink = await repo.get_owner_sharelink(sharelink_id, current_user.id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="Share link not found")

    items = await repo.get_selected_items_for_sharelink(sharelink.id)
    search_expression = LIGHTROOM_SEPARATOR.join(filename for filename, _ in items)
    return Response(
        content=search_expression,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="selection_{sharelink.id}_lightroom.txt"'},
    )


@router.get("/galleries/{gallery_id}/selections/export/summary.csv")
async def export_gallery_selection_summary_csv(
    gallery_id: uuid.UUID,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> Response:
    if not await repo.gallery_exists_for_owner(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    summary_rows = await repo.get_gallery_selection_summary(gallery_id, current_user.id)
    rows = [[str(sharelink_id), label or "", status, str(selected_count)] for sharelink_id, label, status, selected_count in summary_rows]
    return _csv_response(f"gallery_{gallery_id}_selection_summary.csv", ["sharelink_id", "label", "selection_status", "selected_count"], rows)


@router.get("/galleries/{gallery_id}/selections/export/links.csv")
async def export_gallery_selection_links_csv(
    gallery_id: uuid.UUID,
    request: Request,
    repo: SelectionRepository = Depends(get_selection_repository),
    current_user: User = Depends(get_current_user),
) -> Response:
    if not await repo.gallery_exists_for_owner(gallery_id, current_user.id):
        raise HTTPException(status_code=404, detail="Gallery not found")

    rows_data = await repo.get_gallery_sharelinks_with_sessions(gallery_id, current_user.id)
    aggregates = await repo.get_gallery_session_aggregates(gallery_id, current_user.id)
    base_url = str(request.base_url).rstrip("/")
    rows = [
        [
            str(sharelink.id),
            sharelink.label or "",
            f"{base_url}/share/{sharelink.id}",
            (_selection_rollup_status(aggregate[0], aggregate[1], aggregate[2], aggregate[3]) if aggregate is not None else "not_started"),
            str(aggregate[4] if aggregate is not None else 0),
            (aggregate[5] if aggregate is not None and aggregate[5] is not None else (session.updated_at if session else sharelink.updated_at)).isoformat(),
        ]
        for sharelink, session in rows_data
        for aggregate in [aggregates.get(sharelink.id)]
    ]

    return _csv_response(
        f"gallery_{gallery_id}_selection_links.csv",
        ["sharelink_id", "label", "public_url", "selection_status", "selected_count", "updated_at"],
        rows,
    )
