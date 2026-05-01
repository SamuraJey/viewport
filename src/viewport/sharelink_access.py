import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol
from urllib.parse import urlsplit

import jwt
from fastapi import HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import verify_password
from viewport.auth_utils import authsettings
from viewport.logger import logger
from viewport.models.sharelink import ShareLink
from viewport.schemas.sharelink import validate_sharelink_password
from viewport.sharelink_utils import is_sharelink_expired

PUBLIC_CACHE_CONTROL_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
SHARE_PASSWORD_HEADER = "x-viewport-share-password"
SHARE_ACCESS_COOKIE_PREFIX = "viewport-share-access-"
SHARE_ACCESS_TOKEN_TYPE = "share_access"
SHARE_ACCESS_TTL_SECONDS = 60 * 60 * 24
PASSWORD_CHALLENGE_HEADERS = {
    **PUBLIC_CACHE_CONTROL_HEADERS,
    "WWW-Authenticate": 'ShareLinkPassword realm="viewport"',
}


class PublicShareLinkRepository(Protocol):
    async def get_sharelink_for_public_access(self, sharelink_id: uuid.UUID) -> ShareLink | None: ...


async def get_available_public_sharelink(
    share_id: uuid.UUID,
    repo: PublicShareLinkRepository,
) -> ShareLink:
    sharelink = await repo.get_sharelink_for_public_access(share_id)
    if not sharelink:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if not sharelink.is_active:
        raise HTTPException(status_code=404, detail="ShareLink not found", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    if is_sharelink_expired(sharelink.expires_at):
        raise HTTPException(status_code=410, detail="ShareLink expired", headers=PUBLIC_CACHE_CONTROL_HEADERS)
    return sharelink


async def get_valid_public_sharelink(
    share_id: uuid.UUID,
    repo: PublicShareLinkRepository,
    request: Request,
) -> ShareLink:
    sharelink = await get_available_public_sharelink(share_id, repo)
    await require_sharelink_password(sharelink, request)
    return sharelink


async def require_sharelink_password(sharelink: ShareLink, request: Request) -> None:
    if sharelink.password_hash is None:
        return

    if has_valid_share_access_cookie(sharelink, request):
        return

    supplied_password = request.headers.get(SHARE_PASSWORD_HEADER)
    if not supplied_password:
        _log_denied_password_attempt(sharelink, request, reason="password_required")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)

    if not _is_valid_sharelink_password_shape(supplied_password):
        _log_denied_password_attempt(sharelink, request, reason="password_failed")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)

    is_valid = await run_in_threadpool(verify_password, supplied_password, sharelink.password_hash)
    if not is_valid:
        _log_denied_password_attempt(sharelink, request, reason="password_failed")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)


async def unlock_sharelink_password(
    sharelink: ShareLink,
    password: str,
    request: Request,
    response: Response,
) -> None:
    if sharelink.password_hash is None:
        return

    is_valid = await run_in_threadpool(verify_password, password, sharelink.password_hash)
    if not is_valid:
        _log_denied_password_attempt(sharelink, request, reason="password_failed")
        raise HTTPException(status_code=401, detail="ShareLink password required", headers=PASSWORD_CHALLENGE_HEADERS)

    set_share_access_cookie(sharelink, request, response)


def _is_valid_sharelink_password_shape(password: str) -> bool:
    try:
        validate_sharelink_password(password)
    except ValueError:
        return False
    return True


def has_valid_share_access_cookie(sharelink: ShareLink, request: Request) -> bool:
    if sharelink.password_hash is None:
        return False

    cookie_value = request.cookies.get(_share_access_cookie_name(sharelink.id))
    if not cookie_value:
        return False

    try:
        payload = jwt.decode(cookie_value, authsettings.jwt_secret_key, algorithms=[authsettings.jwt_algorithm])
    except jwt.InvalidTokenError:
        return False

    if payload.get("type") != SHARE_ACCESS_TOKEN_TYPE:
        return False
    if payload.get("sub") != str(sharelink.id):
        return False

    expected_fingerprint = _share_password_fingerprint(sharelink)
    token_fingerprint = payload.get("pwd")
    return isinstance(token_fingerprint, str) and hmac.compare_digest(token_fingerprint, expected_fingerprint)


def set_share_access_cookie(sharelink: ShareLink, request: Request, response: Response) -> None:
    issued_at = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(sharelink.id),
            "iat": issued_at,
            "exp": issued_at + timedelta(seconds=SHARE_ACCESS_TTL_SECONDS),
            "type": SHARE_ACCESS_TOKEN_TYPE,
            "pwd": _share_password_fingerprint(sharelink),
        },
        authsettings.jwt_secret_key,
        algorithm=authsettings.jwt_algorithm,
    )
    response.set_cookie(
        key=_share_access_cookie_name(sharelink.id),
        value=token,
        max_age=SHARE_ACCESS_TTL_SECONDS,
        httponly=True,
        samesite=_resolve_share_cookie_samesite(request),
        secure=_is_request_https(request),
        path="/",
    )


def _share_access_cookie_name(share_id: uuid.UUID) -> str:
    return f"{SHARE_ACCESS_COOKIE_PREFIX}{share_id}"


def _share_password_fingerprint(sharelink: ShareLink) -> str:
    password_hash = sharelink.password_hash or ""
    return hmac.new(
        authsettings.jwt_secret_key.encode("utf-8"),
        password_hash.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _resolve_share_cookie_samesite(request: Request) -> Literal["lax", "none"]:
    if _is_cross_origin_request(request) and _is_request_https(request):
        return "none"
    return "lax"


def _is_request_https(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto:
        return forwarded_proto.split(",")[0].strip().lower() == "https"
    return request.url.scheme == "https"


def _is_cross_origin_request(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return False

    request_origin = _request_origin(request)
    parsed_origin = _normalize_origin(origin)
    return parsed_origin is not None and request_origin is not None and parsed_origin != request_origin


def _request_origin(request: Request) -> tuple[str, str] | None:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host:
        return None
    forwarded_host = host.split(",")[0].strip().lower()
    return (_public_request_scheme(request), forwarded_host)


def _normalize_origin(origin: str) -> tuple[str, str] | None:
    parsed = urlsplit(origin)
    if not parsed.scheme or not parsed.netloc:
        return None
    return (parsed.scheme.lower(), parsed.netloc.lower())


def _public_request_scheme(request: Request) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto:
        return forwarded_proto.split(",")[0].strip().lower()
    return request.url.scheme.lower()


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
