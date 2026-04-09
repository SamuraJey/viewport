from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response

from viewport.api.selection import (
    _csv_response,
    _get_selection_resume_token,
    _normalize_optional_text,
    _selection_rollup_status,
    _set_selection_cookie,
    _should_use_secure_selection_cookie,
    _to_selection_item_response,
    _validate_contact_requirements,
    _validate_session_mutable,
    _validate_submit_requirements,
    update_owner_selection_config,
)
from viewport.models.sharelink_selection import SelectionSessionStatus, ShareLinkSelectionConfig
from viewport.schemas.selection import SelectionConfigUpdateRequest, SelectionSessionStartRequest


def _make_request(
    *,
    scheme: str = "http",
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> Request:
    raw_headers = [(key.lower().encode("latin-1"), value.encode("latin-1")) for key, value in (headers or {}).items()]
    if cookies:
        cookie_header = "; ".join(f"{key}={value}" for key, value in cookies.items())
        raw_headers.append((b"cookie", cookie_header.encode("latin-1")))

    scope = {
        "type": "http",
        "scheme": scheme,
        "method": "GET",
        "path": "/",
        "headers": raw_headers,
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_selection_cookie_uses_forwarded_proto_and_scoped_path():
    share_id = uuid4()
    request = _make_request(headers={"x-forwarded-proto": "https, http"})
    response = Response()

    _set_selection_cookie(request, response, share_id, "resume-token")

    cookie_header = response.headers["set-cookie"]
    assert f"viewport-selection-resume-{share_id}=resume-token" in cookie_header
    assert "Path=/" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=lax" in cookie_header
    assert "Secure" in cookie_header


def test_should_use_secure_selection_cookie_falls_back_to_request_scheme():
    assert _should_use_secure_selection_cookie(_make_request(scheme="https")) is True
    assert _should_use_secure_selection_cookie(_make_request(scheme="http")) is False
    assert _should_use_secure_selection_cookie(_make_request(scheme="https", headers={"x-forwarded-proto": "http"})) is False


def test_get_selection_resume_token_prefers_query_and_falls_back_to_cookie():
    share_id = uuid4()
    cookie_name = f"viewport-selection-resume-{share_id}"
    request = _make_request(cookies={cookie_name: "cookie-token"})

    assert _get_selection_resume_token(request, share_id, " query-token ") == "query-token"
    assert _get_selection_resume_token(request, share_id, None) == "cookie-token"
    assert _get_selection_resume_token(_make_request(), share_id, "   ") is None


def test_normalize_optional_text_trims_and_clears_empty_strings():
    assert _normalize_optional_text(None) is None
    assert _normalize_optional_text("  hello  ") == "hello"
    assert _normalize_optional_text("   ") is None


def test_validate_contact_requirements_returns_normalized_payload():
    config = ShareLinkSelectionConfig(
        require_email=True,
        require_phone=True,
        require_client_note=True,
    )
    payload = SelectionSessionStartRequest(
        client_name="  Jane Client  ",
        client_email="jane@example.com",
        client_phone="  +12345  ",
        client_note="  Prioritize  ",
    )

    client_name, client_email, client_phone, client_note = _validate_contact_requirements(config, payload)

    assert client_name == "Jane Client"
    assert client_email == "jane@example.com"
    assert client_phone == "+12345"
    assert client_note == "Prioritize"


@pytest.mark.parametrize(
    ("payload", "config_kwargs", "detail"),
    [
        (
            SelectionSessionStartRequest(client_name="   "),
            {},
            "client_name is required",
        ),
        (
            SelectionSessionStartRequest(client_name="Jane"),
            {"require_email": True},
            "client_email is required",
        ),
        (
            SelectionSessionStartRequest(client_name="Jane", client_email="jane@example.com"),
            {"require_phone": True},
            "client_phone is required",
        ),
        (
            SelectionSessionStartRequest(client_name="Jane", client_email="jane@example.com"),
            {"require_client_note": True},
            "client_note is required",
        ),
    ],
)
def test_validate_contact_requirements_rejects_missing_required_fields(
    payload: SelectionSessionStartRequest,
    config_kwargs: dict[str, bool],
    detail: str,
):
    config = ShareLinkSelectionConfig(**config_kwargs)

    with pytest.raises(HTTPException) as exc_info:
        _validate_contact_requirements(config, payload)

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == detail


@pytest.mark.parametrize(
    ("status", "detail"),
    [
        (SelectionSessionStatus.CLOSED.value, "Selection is closed by photographer"),
        (SelectionSessionStatus.SUBMITTED.value, "Selection is already submitted"),
    ],
)
def test_validate_session_mutable_blocks_closed_and_submitted_sessions(
    status: str,
    detail: str,
):
    session = SimpleNamespace(status=status)

    with pytest.raises(HTTPException) as exc_info:
        _validate_session_mutable(session)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == detail


@pytest.mark.parametrize(
    ("config", "session", "detail"),
    [
        (
            ShareLinkSelectionConfig(require_email=True),
            SimpleNamespace(client_email=None, client_phone=None, client_note=None, selected_count=1),
            "client_email is required",
        ),
        (
            ShareLinkSelectionConfig(require_phone=True),
            SimpleNamespace(client_email=None, client_phone="   ", client_note=None, selected_count=1),
            "client_phone is required",
        ),
        (
            ShareLinkSelectionConfig(require_client_note=True),
            SimpleNamespace(client_email=None, client_phone=None, client_note="   ", selected_count=1),
            "client_note is required",
        ),
        (
            ShareLinkSelectionConfig(limit_enabled=True, limit_value=1),
            SimpleNamespace(client_email=None, client_phone=None, client_note=None, selected_count=2),
            "Selected photos exceed the limit (1)",
        ),
        (
            ShareLinkSelectionConfig(),
            SimpleNamespace(client_email=None, client_phone=None, client_note=None, selected_count=0),
            "At least one photo must be selected before submit",
        ),
    ],
)
def test_validate_submit_requirements_rejects_invalid_sessions(
    config: ShareLinkSelectionConfig,
    session: SimpleNamespace,
    detail: str,
):
    with pytest.raises(HTTPException) as exc_info:
        _validate_submit_requirements(config, session)

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == detail


def test_to_selection_item_response_handles_loaded_and_unloaded_photo_relationships():
    now = datetime.now(UTC)
    photo_id = uuid4()
    item_with_photo = SimpleNamespace(
        photo_id=photo_id,
        comment="Needs retouch",
        selected_at=now,
        updated_at=now,
        photo=SimpleNamespace(display_name="frame-01.jpg", thumbnail_object_key="thumb-key"),
    )
    item_without_photo = SimpleNamespace(
        photo_id=uuid4(),
        comment=None,
        selected_at=now,
        updated_at=now,
    )

    response_with_photo = _to_selection_item_response(item_with_photo, {"thumb-key": "https://example.com/thumb.jpg"})
    response_without_photo = _to_selection_item_response(item_without_photo)

    assert response_with_photo.photo_id == str(photo_id)
    assert response_with_photo.photo_display_name == "frame-01.jpg"
    assert response_with_photo.photo_thumbnail_url == "https://example.com/thumb.jpg"
    assert response_without_photo.photo_display_name is None
    assert response_without_photo.photo_thumbnail_url is None


@pytest.mark.parametrize(
    ("counts", "expected"),
    [
        ((0, 0, 0, 0), "not_started"),
        ((2, 1, 1, 0), SelectionSessionStatus.SUBMITTED.value),
        ((2, 0, 1, 1), SelectionSessionStatus.IN_PROGRESS.value),
        ((2, 0, 0, 2), SelectionSessionStatus.CLOSED.value),
        ((2, 0, 0, 0), "not_started"),
    ],
)
def test_selection_rollup_status_prefers_submitted_then_in_progress_then_closed(
    counts: tuple[int, int, int, int],
    expected: str,
):
    assert _selection_rollup_status(*counts) == expected


def test_csv_response_writes_headers_and_rows():
    response = _csv_response("selection.csv", ["filename", "comment"], [["a.jpg", "pick"]])

    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == 'attachment; filename="selection.csv"'
    assert response.body.decode("utf-8") == "filename,comment\r\na.jpg,pick\r\n"


@pytest.mark.asyncio
async def test_update_owner_selection_config_rejects_limit_value_when_limit_is_disabled():
    gallery_id = uuid4()
    sharelink_id = uuid4()
    current_user = SimpleNamespace(id=uuid4())
    repo = SimpleNamespace(
        get_sharelink_for_gallery_owner=AsyncMock(return_value=SimpleNamespace(id=sharelink_id)),
        get_or_create_config=AsyncMock(return_value=ShareLinkSelectionConfig(sharelink_id=sharelink_id)),
    )
    req = SelectionConfigUpdateRequest.model_construct(
        limit_enabled=False,
        limit_value=1,
        _fields_set={"limit_enabled", "limit_value"},
    )

    with pytest.raises(HTTPException) as exc_info:
        await update_owner_selection_config(
            gallery_id=gallery_id,
            sharelink_id=sharelink_id,
            req=req,
            repo=repo,
            current_user=current_user,
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "limit_value must not be provided when limit_enabled is false"
