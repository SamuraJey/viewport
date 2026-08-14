"""Endpoint-level coverage for expensive authentication rate limits."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

import viewport.admin.auth as admin_auth_module
import viewport.api.auth as auth_api
import viewport.api.public as public_api
import viewport.sharelink_access as sharelink_access
from viewport.admin import AdminAuth, ViewportAdmin
from viewport.dependencies import get_sharelink_repository, get_user_repository
from viewport.models.sharelink import ShareScopeType
from viewport.services.auth_rate_limiter import AuthRateLimiter, AuthRateLimitSettings
from viewport.services.redis_service import RedisService


def _limiter_settings(**overrides: object) -> AuthRateLimitSettings:
    values: dict[str, object] = {
        "user_login_ip_limit": 10,
        "user_login_ip_window_seconds": 60,
        "user_login_scope_limit": 10,
        "user_login_scope_window_seconds": 60,
        "admin_login_ip_limit": 10,
        "admin_login_ip_window_seconds": 60,
        "admin_login_scope_limit": 10,
        "admin_login_scope_window_seconds": 60,
        "share_unlock_ip_limit": 10,
        "share_unlock_ip_window_seconds": 60,
        "share_unlock_scope_limit": 10,
        "share_unlock_scope_window_seconds": 60,
        "fallback_max_entries": 100,
        "trusted_proxy_cidrs": "",
    }
    values.update(overrides)
    return AuthRateLimitSettings(**values)


def _local_limiter(**overrides: object) -> AuthRateLimiter:
    unavailable_redis = RedisService(None, None, available=False)
    return AuthRateLimiter(_limiter_settings(**overrides), unavailable_redis)


def _auth_app(repo: object) -> FastAPI:
    app = FastAPI()
    app.include_router(auth_api.router)
    app.dependency_overrides[get_user_repository] = lambda: repo
    return app


def _public_app(repo: object) -> FastAPI:
    app = FastAPI()
    app.include_router(public_api.router)
    app.dependency_overrides[get_sharelink_repository] = lambda: repo
    return app


def _protected_sharelink(*, active: bool = True, expires_at: datetime | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        scope_type=ShareScopeType.GALLERY.value,
        gallery_id=uuid4(),
        project_id=None,
        password_hash="stored-password-hash",
        is_active=active,
        expires_at=expires_at,
    )


def test_login_rate_limit_runs_before_bcrypt_and_tracks_ip_across_identifiers(monkeypatch: pytest.MonkeyPatch):
    repo = SimpleNamespace(get_user_by_email=AsyncMock(return_value=None))
    limiter = _local_limiter(user_login_ip_limit=1, user_login_scope_limit=10)
    verify_password = Mock(return_value=False)
    monkeypatch.setattr(auth_api, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(auth_api, "verify_password", verify_password)

    with TestClient(_auth_app(repo), client=("192.0.2.10", 41000)) as client:
        first = client.post("/auth/login", json={"email": "first@example.com", "password": "wrong-pass"})
        denied = client.post("/auth/login", json={"email": "second@example.com", "password": "wrong-pass"})

    assert first.status_code == 401
    assert denied.status_code == 429
    assert denied.json() == {"detail": "Too many authentication attempts"}
    assert denied.headers["Retry-After"] == "60"
    assert verify_password.call_count == 1
    repo.get_user_by_email.assert_awaited_once_with("first@example.com")


def test_login_account_budget_tracks_identifier_across_client_ips(monkeypatch: pytest.MonkeyPatch):
    repo = SimpleNamespace(get_user_by_email=AsyncMock(return_value=None))
    limiter = _local_limiter(user_login_ip_limit=10, user_login_scope_limit=1)
    verify_password = Mock(return_value=False)
    monkeypatch.setattr(auth_api, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(auth_api, "verify_password", verify_password)
    app = _auth_app(repo)

    with TestClient(app, client=("192.0.2.11", 41000)) as first_client:
        first = first_client.post("/auth/login", json={"email": "owner@example.com", "password": "wrong-pass"})
    with TestClient(app, client=("192.0.2.12", 41000)) as second_client:
        denied = second_client.post("/auth/login", json={"email": "owner@example.com", "password": "wrong-pass"})

    assert first.status_code == 401
    assert denied.status_code == 429
    assert denied.headers["Retry-After"] == "60"
    assert verify_password.call_count == 1
    repo.get_user_by_email.assert_awaited_once_with("owner@example.com")


class _AdminResult:
    def __init__(self, user: object):
        self._user = user

    def scalar_one_or_none(self) -> object:
        return self._user


class _AdminSession:
    def __init__(self, user: object):
        self._user = user
        self.execute = AsyncMock(return_value=_AdminResult(user))

    async def __aenter__(self) -> "_AdminSession":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class _AdminSessionMaker:
    def __init__(self, user: object):
        self._user = user
        self.calls = 0

    def __call__(self) -> _AdminSession:
        self.calls += 1
        return _AdminSession(self._user)


def test_sqladmin_login_returns_custom_429_before_second_bcrypt(monkeypatch: pytest.MonkeyPatch):
    limiter = _local_limiter(admin_login_ip_limit=1, admin_login_scope_limit=1)
    verify_password = Mock(return_value=False)
    session_maker = _AdminSessionMaker(
        SimpleNamespace(id=uuid4(), password_hash="stored-password-hash", is_admin=True),
    )
    backend = AdminAuth(secret_key="test-secret")
    backend._session_maker = session_maker  # type: ignore[assignment]
    monkeypatch.setattr(admin_auth_module, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(admin_auth_module, "verify_password", verify_password)

    app = FastAPI()
    ViewportAdmin(
        app,
        create_engine("sqlite://"),
        base_url="/admin",
        authentication_backend=backend,
    )

    with TestClient(app, follow_redirects=False, client=("192.0.2.20", 42000)) as client:
        first = client.post("/admin/login", data={"username": "admin@example.com", "password": "wrong-pass"})
        denied = client.post("/admin/login", data={"username": "admin@example.com", "password": "wrong-pass"})

    assert first.status_code == 400
    assert denied.status_code == 429
    assert denied.headers["content-type"].startswith("text/html")
    assert "Too many authentication attempts" in denied.text
    assert denied.headers["Retry-After"] == "60"
    assert verify_password.call_count == 1
    assert session_maker.calls == 1


def test_share_unlock_rate_limit_runs_before_bcrypt(monkeypatch: pytest.MonkeyPatch):
    sharelink = _protected_sharelink()
    repo = SimpleNamespace(get_sharelink_for_public_access=AsyncMock(return_value=sharelink))
    limiter = _local_limiter(share_unlock_ip_limit=1, share_unlock_scope_limit=1)
    verify_password = Mock(return_value=False)
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(sharelink_access, "verify_password", verify_password)

    with TestClient(_public_app(repo), client=("192.0.2.30", 43000)) as client:
        missing_password = client.post(f"/s/{sharelink.id}/unlock")
        first = client.post(f"/s/{sharelink.id}/unlock", json={"password": "wrong-pass"})
        denied = client.post(f"/s/{sharelink.id}/unlock", json={"password": "wrong-pass"})

    assert missing_password.status_code == 401
    assert missing_password.json() == {"detail": "ShareLink password required"}
    assert first.status_code == 401
    assert denied.status_code == 429
    assert denied.headers["Retry-After"] == "60"
    assert verify_password.call_count == 1


def test_direct_share_password_header_rate_limit_runs_before_bcrypt(monkeypatch: pytest.MonkeyPatch):
    sharelink = _protected_sharelink()
    repo = SimpleNamespace(get_sharelink_for_public_access=AsyncMock(return_value=sharelink))
    limiter = _local_limiter(share_unlock_ip_limit=1, share_unlock_scope_limit=1)
    verify_password = Mock(return_value=False)
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: limiter)
    monkeypatch.setattr(sharelink_access, "verify_password", verify_password)
    photo_id = uuid4()

    with TestClient(_public_app(repo), client=("192.0.2.31", 43000)) as client:
        first = client.head(
            f"/s/{sharelink.id}/photos/{photo_id}/download",
            headers={sharelink_access.SHARE_PASSWORD_HEADER: "wrong-pass"},
        )
        denied = client.head(
            f"/s/{sharelink.id}/photos/{photo_id}/download",
            headers={sharelink_access.SHARE_PASSWORD_HEADER: "wrong-pass"},
        )

    assert first.status_code == 401
    assert denied.status_code == 429
    assert denied.headers["Retry-After"] == "60"
    assert verify_password.call_count == 1


@pytest.mark.parametrize(
    ("availability", "expected_status"),
    [
        ("missing", 404),
        ("inactive", 404),
        ("expired", 410),
    ],
)
def test_share_unlock_privacy_checks_precede_limiter_and_bcrypt(
    availability: str,
    expected_status: int,
    monkeypatch: pytest.MonkeyPatch,
):
    if availability == "missing":
        sharelink = None
        share_id = uuid4()
    elif availability == "inactive":
        sharelink = _protected_sharelink(active=False)
        share_id = sharelink.id
    else:
        sharelink = _protected_sharelink(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        share_id = sharelink.id

    repo = SimpleNamespace(get_sharelink_for_public_access=AsyncMock(return_value=sharelink))
    enforce = AsyncMock()
    verify_password = Mock(return_value=False)
    monkeypatch.setattr(sharelink_access, "get_auth_rate_limiter", lambda: SimpleNamespace(enforce=enforce))
    monkeypatch.setattr(sharelink_access, "verify_password", verify_password)

    with TestClient(_public_app(repo), client=("192.0.2.32", 43000)) as client:
        response = client.post(f"/s/{share_id}/unlock", json={"password": "wrong-pass"})

    assert response.status_code == expected_status
    assert response.headers["Cache-Control"] == "no-store, max-age=0, must-revalidate"
    enforce.assert_not_awaited()
    verify_password.assert_not_called()
