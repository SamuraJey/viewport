from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, Mock
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi import HTTPException, Request, Response

import viewport.sharelink_access as sharelink_access
from viewport.auth_utils import authsettings


def _sharelink(
    *,
    password_hash: str | None = "stored-password-hash",
    is_active: bool = True,
    expires_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        password_hash=password_hash,
        scope_type="gallery",
        is_active=is_active,
        expires_at=expires_at,
    )


def _request(
    *,
    client: tuple[str, int] | None = ("192.0.2.10", 12345),
    scheme: str = "https",
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
    root_path: str = "",
) -> Request:
    raw_headers = [(name.lower().encode("ascii"), value.encode("latin-1")) for name, value in (headers or {}).items()]
    if cookies:
        raw_headers.append((b"cookie", "; ".join(f"{name}={value}" for name, value in cookies.items()).encode("latin-1")))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": scheme,
            "path": "/s/test/unlock",
            "raw_path": b"/s/test/unlock",
            "root_path": root_path,
            "query_string": b"",
            "headers": raw_headers,
            "client": client,
            "server": ("testserver", 443 if scheme == "https" else 80),
        }
    )


def _cookie_request(share_id: UUID, token: str) -> Request:
    return _request(cookies={f"{sharelink_access.SHARE_ACCESS_COOKIE_PREFIX}{share_id}": token})


def _access_token(sharelink: SimpleNamespace, **overrides: str) -> str:
    payload = {
        "type": sharelink_access.SHARE_ACCESS_TOKEN_TYPE,
        "sub": str(sharelink.id),
        "pwd": sharelink_access._share_password_fingerprint(sharelink),
        **overrides,
    }
    return jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("stored_sharelink", "expected_status"),
    [
        (None, 404),
        (_sharelink(is_active=False), 404),
        (_sharelink(expires_at=datetime.now(UTC) - timedelta(seconds=1)), 410),
    ],
)
async def test_available_sharelink_rejects_unavailable_states(stored_sharelink: SimpleNamespace | None, expected_status: int) -> None:
    repo = SimpleNamespace(get_sharelink_for_public_access=AsyncMock(return_value=stored_sharelink))

    with pytest.raises(HTTPException) as caught:
        await sharelink_access.get_available_public_sharelink(uuid4(), repo)

    assert caught.value.status_code == expected_status
    assert caught.value.headers == sharelink_access.PUBLIC_CACHE_CONTROL_HEADERS


@pytest.mark.asyncio
async def test_valid_public_sharelink_returns_active_unprotected_link() -> None:
    sharelink = _sharelink(password_hash=None)
    repo = SimpleNamespace(get_sharelink_for_public_access=AsyncMock(return_value=sharelink))

    result = await sharelink_access.get_valid_public_sharelink(sharelink.id, repo, _request())

    assert result is sharelink
    repo.get_sharelink_for_public_access.assert_awaited_once_with(sharelink.id)


@pytest.mark.asyncio
async def test_password_requirement_accepts_valid_access_cookie(monkeypatch: pytest.MonkeyPatch) -> None:
    sharelink = _sharelink()
    limiter = SimpleNamespace(enforce=AsyncMock(side_effect=AssertionError("limiter must not run")))
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)

    await sharelink_access.require_sharelink_password(
        sharelink,
        _cookie_request(sharelink.id, _access_token(sharelink)),
    )

    limiter.enforce.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("headers", "reason"), [({}, "password_required"), ({sharelink_access.SHARE_PASSWORD_HEADER: "short"}, "password_failed")])
async def test_password_requirement_rejects_missing_or_malformed_password(
    headers: dict[str, str],
    reason: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sharelink = _sharelink()
    log_denial = Mock()
    monkeypatch.setattr(sharelink_access, "_log_denied_password_attempt", log_denial)

    with pytest.raises(HTTPException) as caught:
        await sharelink_access.require_sharelink_password(sharelink, _request(headers=headers))

    assert caught.value.status_code == 401
    assert caught.value.headers == sharelink_access.PASSWORD_CHALLENGE_HEADERS
    log_denial.assert_called_once_with(sharelink, ANY, reason=reason)


@pytest.mark.asyncio
@pytest.mark.parametrize("password_matches", [True, False])
async def test_password_requirement_rate_limits_before_verification(
    password_matches: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sharelink = _sharelink()
    limiter = SimpleNamespace(enforce=AsyncMock())
    verify_password = Mock(return_value=password_matches)
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(sharelink_access, "verify_password", verify_password)
    request = _request(headers={sharelink_access.SHARE_PASSWORD_HEADER: "valid-password"})

    if password_matches:
        await sharelink_access.require_sharelink_password(sharelink, request)
    else:
        with pytest.raises(HTTPException) as caught:
            await sharelink_access.require_sharelink_password(sharelink, request)
        assert caught.value.status_code == 401

    limiter.enforce.assert_awaited_once_with(request, sharelink_access.AuthRateLimitRoute.SHARE_UNLOCK, str(sharelink.id))
    verify_password.assert_called_once_with("valid-password", sharelink.password_hash)


@pytest.mark.asyncio
async def test_unlock_unprotected_share_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    sharelink = _sharelink(password_hash=None)
    response = Response()
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", Mock(side_effect=AssertionError("limiter must not run")))

    await sharelink_access.unlock_sharelink_password(sharelink, None, _request(), response)

    assert "set-cookie" not in response.headers


@pytest.mark.asyncio
async def test_unlock_rejects_malformed_password_before_limiter(monkeypatch: pytest.MonkeyPatch) -> None:
    limiter = SimpleNamespace(enforce=AsyncMock(side_effect=AssertionError("limiter must not run")))
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)

    with pytest.raises(HTTPException) as caught:
        await sharelink_access.unlock_sharelink_password(_sharelink(), "short", _request(), Response())

    assert caught.value.status_code == 401
    limiter.enforce.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("password_matches", [True, False])
async def test_unlock_verifies_password_and_only_sets_cookie_on_success(
    password_matches: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sharelink = _sharelink()
    limiter = SimpleNamespace(enforce=AsyncMock())
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(sharelink_access, "verify_password", Mock(return_value=password_matches))
    response = Response()
    request = _request(headers={"host": "viewport.example"})

    if password_matches:
        await sharelink_access.unlock_sharelink_password(sharelink, "valid-password", request, response)
        assert sharelink_access.SHARE_ACCESS_COOKIE_PREFIX in response.headers["set-cookie"]
    else:
        with pytest.raises(HTTPException) as caught:
            await sharelink_access.unlock_sharelink_password(sharelink, "valid-password", request, response)
        assert caught.value.status_code == 401
        assert "set-cookie" not in response.headers

    limiter.enforce.assert_awaited_once()


def test_password_shape_validation_accepts_valid_and_rejects_invalid_values() -> None:
    assert sharelink_access._is_valid_sharelink_password_shape("valid-password") is True
    assert sharelink_access._is_valid_sharelink_password_shape("short") is False


def test_unprotected_share_never_accepts_access_cookie() -> None:
    assert sharelink_access.has_valid_share_access_cookie(_sharelink(password_hash=None), _request()) is False


def test_protected_share_without_access_cookie_is_rejected() -> None:
    assert sharelink_access.has_valid_share_access_cookie(_sharelink(), _request()) is False


def test_invalid_or_mismatched_share_access_tokens_are_rejected() -> None:
    sharelink = _sharelink()
    password_fingerprint = sharelink_access._share_password_fingerprint(sharelink)
    tokens = [
        "not-a-jwt",
        jwt.encode(
            {"type": "wrong-type", "sub": str(sharelink.id), "pwd": password_fingerprint},
            authsettings.jwt_secret_key,
            algorithm=authsettings.jwt_algorithm,
        ),
        jwt.encode(
            {"type": sharelink_access.SHARE_ACCESS_TOKEN_TYPE, "sub": str(uuid4()), "pwd": password_fingerprint},
            authsettings.jwt_secret_key,
            algorithm=authsettings.jwt_algorithm,
        ),
    ]

    assert all(not sharelink_access.has_valid_share_access_cookie(sharelink, _cookie_request(sharelink.id, token)) for token in tokens)


def test_access_cookie_is_bound_to_current_password_hash() -> None:
    sharelink = _sharelink()
    token = _access_token(sharelink)

    assert sharelink_access.has_valid_share_access_cookie(sharelink, _cookie_request(sharelink.id, token)) is True

    sharelink.password_hash = "changed-password-hash"
    assert sharelink_access.has_valid_share_access_cookie(sharelink, _cookie_request(sharelink.id, token)) is False


def test_cookie_policy_uses_none_only_for_cross_origin_https() -> None:
    cross_origin_https = _request(headers={"host": "viewport.example", "origin": "https://public.example"})
    cross_origin_http = _request(scheme="http", headers={"host": "viewport.example", "origin": "http://public.example"})

    assert sharelink_access._resolve_share_cookie_samesite(cross_origin_https) == "none"
    assert sharelink_access._resolve_share_cookie_samesite(cross_origin_http) == "lax"


def test_request_https_and_origin_helpers_fall_back_to_request_scope() -> None:
    assert sharelink_access._is_request_https(_request(scheme="https")) is True
    assert sharelink_access._is_request_https(_request(scheme="http")) is False
    assert sharelink_access._is_cross_origin_request(_request()) is False
    assert sharelink_access._public_request_scheme(_request(scheme="http")) == "http"


@pytest.mark.parametrize(("forwarded_proto", "expected"), [("https, http", True), ("http, https", False)])
def test_request_https_uses_first_value_from_trusted_forwarded_proto(
    forwarded_proto: str,
    expected: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = SimpleNamespace(trusted_proxy_cidrs="10.0.0.0/8")
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limit_settings", lambda: settings)
    request = _request(client=("10.0.0.2", 12345), headers={"x-forwarded-proto": forwarded_proto})

    assert sharelink_access._is_request_https(request) is expected


def test_cross_origin_detection_returns_false_without_request_host() -> None:
    request = _request(headers={"origin": "https://public.example"})

    assert sharelink_access._is_cross_origin_request(request) is False


def test_cross_origin_detection_rejects_malformed_origin() -> None:
    request = _request(headers={"host": "viewport.example", "origin": "not-an-origin"})

    assert sharelink_access._is_cross_origin_request(request) is False


def test_public_base_url_falls_back_when_host_is_absent() -> None:
    assert sharelink_access.get_public_request_base_url(_request()) == "https://testserver"


def test_public_base_url_without_socket_peer_uses_request_base_url() -> None:
    assert sharelink_access.get_public_request_base_url(_request(client=None, headers={"host": "internal.example"})) == "https://internal.example"


def test_public_base_url_uses_trusted_forwarded_origin_and_root_path(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(trusted_proxy_cidrs="10.0.0.0/8")
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limit_settings", lambda: settings)
    request = _request(
        client=("10.0.0.2", 12345),
        headers={
            "host": "internal.example",
            "x-forwarded-host": "public.example, internal.example",
            "x-forwarded-proto": "https, http",
        },
        root_path="/api",
    )

    assert sharelink_access.get_public_request_base_url(request) == "https://public.example/api"


def test_forwarded_metadata_requires_a_trusted_socket_peer(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(trusted_proxy_cidrs="10.0.0.0/8")
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limit_settings", lambda: settings)

    assert sharelink_access._trusted_forwarded_header(_request(client=None, headers={"x-forwarded-proto": "https"}), "x-forwarded-proto") is None
    assert sharelink_access._trusted_forwarded_header(_request(headers={"x-forwarded-proto": "https"}), "x-forwarded-proto") is None


def test_denial_log_uses_invalid_correlation_for_malformed_peer(monkeypatch: pytest.MonkeyPatch) -> None:
    sharelink = _sharelink()
    log_event = Mock()
    monkeypatch.setattr(sharelink_access.logger, "log_event", log_event)

    sharelink_access._log_denied_password_attempt(
        sharelink,
        _request(client=("not-an-ip", 12345)),
        reason="password_failed",
    )

    log_event.assert_called_once()
    assert log_event.call_args.kwargs["client_correlation"] == "invalid"


def test_denial_log_hashes_valid_client_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    sharelink = _sharelink()
    log_event = Mock()
    monkeypatch.setattr(sharelink_access.logger, "log_event", log_event)

    sharelink_access._log_denied_password_attempt(sharelink, _request(), reason="password_required")

    correlation = log_event.call_args.kwargs["client_correlation"]
    assert correlation != "invalid"
    assert len(correlation) == 16
