import uuid
from typing import Protocol

from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import verify_password
from viewport.logger import logger
from viewport.models.sharelink import ShareLink
from viewport.sharelink_utils import is_sharelink_expired

PUBLIC_CACHE_CONTROL_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
SHARE_PASSWORD_HEADER = "x-viewport-share-password"
PASSWORD_CHALLENGE_HEADERS = {
    **PUBLIC_CACHE_CONTROL_HEADERS,
    "WWW-Authenticate": 'ShareLinkPassword realm="viewport"',
}


class PublicShareLinkRepository(Protocol):
    async def get_sharelink_for_public_access(self, sharelink_id: uuid.UUID) -> ShareLink | None: ...


async def get_valid_public_sharelink(
    share_id: uuid.UUID,
    repo: PublicShareLinkRepository,
    request: Request,
) -> ShareLink:
    sharelink = await repo.get_sharelink_for_public_access(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if not sharelink.is_active:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if is_sharelink_expired(sharelink.expires_at):
        raise HTTPException(status_code=410, detail="ShareLink expired", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    await require_sharelink_password(sharelink, request)
    return sharelink


async def require_sharelink_password(sharelink: ShareLink, request: Request) -> None:
    if sharelink.password_hash is None:
        return

    supplied_password = request.headers.get(SHARE_PASSWORD_HEADER)
    if not supplied_password:
        _log_denied_password_attempt(sharelink, request, reason="password_required")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)

    is_valid = await run_in_threadpool(verify_password, supplied_password, sharelink.password_hash)
    if not is_valid:
        _log_denied_password_attempt(sharelink, request, reason="password_failed")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)


def _log_denied_password_attempt(sharelink: ShareLink, request: Request, *, reason: str) -> None:
    logger.log_event(
        "sharelink_password_denied",
        share_id=str(sharelink.id),
        scope_type=sharelink.scope_type,
        reason=reason,
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
