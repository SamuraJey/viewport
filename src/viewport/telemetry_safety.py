"""Privacy helpers shared by logs, metrics, and trace attributes.

User-controlled and secret values are omitted, collapsed to bounded enums, or
replaced with short salted SHA-256 fingerprints before they reach telemetry.
"""

from __future__ import annotations

import hashlib
import os
import re
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import parse_qsl, urlsplit, urlunsplit

REDACTED = "[REDACTED]"
FINGERPRINT_PREFIX = "sha256:"

_SENSITIVE_KEY_RE = re.compile(
    r"(authorization|cookie|set-cookie|password|passwd|secret|token|jwt|api[_-]?key|access[_-]?key|secret[_-]?key|x-amz-signature|awsaccesskeyid)",
    re.IGNORECASE,
)
_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_AWS_QUERY_RE = re.compile(r"(X-Amz-(?:Signature|Credential|Security-Token|Algorithm|Date|Expires|SignedHeaders)|AWSAccessKeyId)=([^&\s]+)", re.IGNORECASE)
_PASSWORD_ASSIGNMENT_RE = re.compile(r"(?i)(password|share_password|token|secret|cookie|authorization)(\s*[=:]\s*)([^\s,;]+)")
_IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_OBJECT_KEY_LIKE_RE = re.compile(r"(?<![A-Za-z0-9:/])(?:[A-Za-z0-9][A-Za-z0-9_.=+-]*/){1,}[A-Za-z0-9][A-Za-z0-9_.=+-]*\.[A-Za-z0-9]{2,8}\b")
_UUID_SEGMENT_RE = re.compile(r"(?i)(?<=/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=/|$|[?#])")
_UUID_TEXT_RE = re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")
_PUBLIC_SHARE_ROUTE_RE = re.compile(r"(?i)(/s/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=/|$|[?#])")
_NAMED_UUID_ROUTE_RE = re.compile(
    r"(?i)(/(?P<name>galleries|gallery|projects|project|photos|photo|share-links|sharelinks|users)/)"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=/|$|[?#])"
)
_ROUTE_UUID_LABELS = {
    "galleries": "gallery_id",
    "gallery": "gallery_id",
    "projects": "project_id",
    "project": "project_id",
    "photos": "photo_id",
    "photo": "photo_id",
    "share-links": "share_link_id",
    "sharelinks": "share_link_id",
    "users": "user_id",
}
_SPAN_PATH_KEYS = {"http.target", "http.route", "url.path"}
_SPAN_URL_KEYS = {"http.url", "url.full"}
_SPAN_QUERY_KEYS = {"url.query"}
_SPAN_USER_AGENT_KEYS = {"http.user_agent", "user_agent.original"}
_SPAN_IP_KEYS = {"http.client_ip", "net.peer.ip", "client.address", "client.socket.address", "network.peer.address"}
_SPAN_SENSITIVE_KEYS = {
    "db.statement",
    "http.request.header.authorization",
    "http.request.header.cookie",
    "http.request.header.set_cookie",
    "http.response.header.set_cookie",
    "enduser.id",
    "user.email",
    "s3.object.key",
    "aws.s3.key",
    "share_id",
    "sharelink_id",
    "share_password",
}
_EMAIL_KEYS = {"email", "client_email", "customer_email", "user_email", "contact_email", "user.email"}
_NAME_KEYS = {"name", "client_name", "customer_name", "display_name", "user_name", "username", "contact_name"}


def fingerprint_value(value: Any, *, salt: str | None = None, length: int = 16) -> str | None:
    """Return a short deterministic fingerprint for a sensitive value.

    A deployment can set ``OBSERVABILITY_HASH_SALT`` to make fingerprints stable
    inside an environment without making them globally reversible/correlatable.
    """

    if value is None:
        return None
    text = str(value)
    if text == "":
        return None
    resolved_salt = salt if salt is not None else os.getenv("OBSERVABILITY_HASH_SALT", "viewport-observability-local")
    digest = hashlib.sha256(f"{resolved_salt}:{text}".encode()).hexdigest()
    return f"{FINGERPRINT_PREFIX}{digest[:length]}"


def safe_id(value: Any) -> str | None:
    """Alias used at log sites where a raw ID may act like a bearer token."""

    return fingerprint_value(value)


def safe_object_key(value: Any) -> str | None:
    """Fingerprint an S3 object key instead of logging the raw key/path."""

    return fingerprint_value(value)


def safe_s3_errors(errors: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return S3 batch-delete errors without raw object keys or provider messages."""

    return [
        {
            "key_hash": safe_object_key(str(error.get("Key"))) if error.get("Key") else None,
            "code": error.get("Code"),
            "message": REDACTED if error.get("Message") else None,
        }
        for error in errors
    ]


def user_agent_family(user_agent: str | None) -> str | None:
    """Collapse a User-Agent header to a coarse browser/client family."""

    if not user_agent:
        return None
    ua = user_agent.lower()
    if "firefox" in ua:
        return "firefox"
    if "edg/" in ua or "edge/" in ua:
        return "edge"
    if "chrome" in ua or "chromium" in ua:
        return "chrome"
    if "safari" in ua:
        return "safari"
    if "curl" in ua:
        return "curl"
    if "python" in ua or "httpx" in ua or "requests" in ua:
        return "bot_or_script"
    return "other"


def sanitize_label(value: str, *, allowed: set[str], fallback: str = "other") -> str:
    """Keep metric labels bounded to explicit enum values."""

    return value if value in allowed else fallback


def redact_url(value: str) -> str:
    """Strip sensitive query parameters from URLs/presigned URLs."""

    try:
        parsed = urlsplit(value)
    except Exception:
        return value
    safe_path = normalize_telemetry_path(parsed.path)
    if not parsed.query:
        return urlunsplit((parsed.scheme, parsed.netloc, safe_path, "", parsed.fragment))
    safe_query = []
    changed = False
    for key, val in parse_qsl(parsed.query, keep_blank_values=True):
        if _SENSITIVE_KEY_RE.search(key) or key.lower().startswith("x-amz-"):
            safe_query.append((key, REDACTED))
            changed = True
        else:
            redacted_value = redact_text(val)
            safe_query.append((key, redacted_value))
            changed = changed or redacted_value != val
    if not changed and safe_path == parsed.path:
        return value
    query = "&".join(f"{key}={val}" for key, val in safe_query)
    return urlunsplit((parsed.scheme, parsed.netloc, safe_path, query, parsed.fragment))


def normalize_telemetry_path(value: Any, *, strip_query: bool = True) -> str:
    """Normalize path/route-like values before they reach logs or spans.

    Public share IDs are bearer-like secrets, and other UUID path segments create
    high-cardinality telemetry. Keep route semantics while replacing IDs with
    route parameter names.
    """

    text = str(value)
    if strip_query:
        text = text.split("?", 1)[0]
    text = _PUBLIC_SHARE_ROUTE_RE.sub(r"\1{share_id}", text)
    segments = text.split("/")
    for index, segment in enumerate(segments):
        if not _UUID_TEXT_RE.fullmatch(segment):
            continue
        previous = segments[index - 1].lower() if index > 0 else ""
        segments[index] = "{" + _ROUTE_UUID_LABELS.get(previous, "uuid") + "}"
    text = "/".join(segments)
    return _UUID_SEGMENT_RE.sub("{uuid}", text)


def redact_text(value: Any) -> str:
    """Best-effort textual redaction for formatter output.

    This is a safety net; production log sites should still pass allowlisted
    structured fields instead of raw sensitive values.
    """

    text = str(value)
    text = _PUBLIC_SHARE_ROUTE_RE.sub(r"\1{share_id}", text)
    text = _NAMED_UUID_ROUTE_RE.sub(lambda m: f"{m.group(1)}{{{_ROUTE_UUID_LABELS.get(m.group('name').lower(), 'uuid')}}}", text)
    text = _UUID_SEGMENT_RE.sub("{uuid}", text)
    text = _BEARER_RE.sub(f"Bearer {REDACTED}", text)
    text = _JWT_RE.sub(REDACTED, text)
    text = _AWS_QUERY_RE.sub(lambda m: f"{m.group(1)}={REDACTED}", text)
    text = _PASSWORD_ASSIGNMENT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
    text = _EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    text = _OBJECT_KEY_LIKE_RE.sub("[REDACTED_OBJECT_KEY]", text)
    text = _IPV4_RE.sub("[REDACTED_IP]", text)
    text = _UUID_TEXT_RE.sub("[REDACTED_UUID]", text)
    return text


def redact_mapping(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Recursively redact structured log/event fields by key allowlist policy."""

    return {str(key): redact_value(key, val) for key, val in payload.items()}


def redact_value(key: Any, value: Any) -> Any:
    key_text = str(key)
    if value is None:
        return None
    lowered = key_text.lower()
    if lowered in {"request_id", "task_id", "trace_id", "span_id", "oteltraceid", "otelspanid"}:
        return redact_text(value) if isinstance(value, str) else value
    if _SENSITIVE_KEY_RE.search(key_text):
        return REDACTED
    if lowered in _EMAIL_KEYS or lowered.endswith("_email"):
        return fingerprint_value(str(value).lower())
    if lowered in _NAME_KEYS:
        return fingerprint_value(value)
    if lowered in {"client_ip", "ip", "remote_addr"}:
        return fingerprint_value(value)
    if lowered in {"user_agent", "user-agent"}:
        return user_agent_family(str(value))
    if lowered in {"share_id", "sharelink_id", "object_key", "thumbnail_object_key", "prefix", "cache_key", "url", "presigned_url"}:
        return fingerprint_value(value)
    if lowered.endswith("_id") or lowered.endswith(".id"):
        return fingerprint_value(value)
    if isinstance(value, Mapping):
        return redact_mapping(value)
    if isinstance(value, list):
        return [redact_value(key_text, item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_value(key_text, item) for item in value)
    if isinstance(value, str):
        return redact_text(redact_url(value))
    return value


def sanitize_span_name(name: str) -> str:
    """Return a route-normalized span name."""

    return redact_text(normalize_telemetry_path(name, strip_query=True))


def sanitize_span_attributes(attributes: Mapping[str, Any]) -> dict[str, Any]:
    """Sanitize OpenTelemetry span attributes before export.

    Auto-instrumentation can attach raw URLs, user agents, client addresses, and
    SQL statements. This function keeps useful low-cardinality attributes and
    fingerprints/deletes sensitive values.
    """

    return {str(key): sanitize_span_attribute(str(key), value) for key, value in attributes.items()}


def sanitize_span_attribute(key: str, value: Any) -> Any:
    lowered = key.lower()
    if value is None:
        return None
    if _SENSITIVE_KEY_RE.search(lowered) or lowered in _SPAN_SENSITIVE_KEYS:
        return REDACTED
    if lowered in _EMAIL_KEYS or lowered.endswith("_email") or lowered in _NAME_KEYS:
        return fingerprint_value(str(value).lower() if "email" in lowered else value)
    if lowered in _SPAN_PATH_KEYS:
        return normalize_telemetry_path(value)
    if lowered in _SPAN_URL_KEYS:
        return redact_url(str(value))
    if lowered in _SPAN_QUERY_KEYS:
        return REDACTED
    if lowered in _SPAN_USER_AGENT_KEYS:
        return user_agent_family(str(value)) or REDACTED
    if lowered in _SPAN_IP_KEYS:
        return fingerprint_value(value)
    if lowered.endswith(".id") or lowered.endswith("_id"):
        return fingerprint_value(value)
    if any(part in lowered for part in ("object_key", "s3.key", "presigned", "password", "cookie", "authorization")):
        return REDACTED
    if isinstance(value, Mapping):
        return sanitize_span_attributes(value)
    if isinstance(value, list):
        return [sanitize_span_attribute(key, item) for item in value]
    if isinstance(value, tuple):
        return tuple(sanitize_span_attribute(key, item) for item in value)
    if isinstance(value, str):
        return redact_text(redact_url(value))
    return value


def safe_exception_fields(exc: BaseException) -> dict[str, Any]:
    """Return bounded, privacy-safe exception fields for telemetry logs."""

    fields: dict[str, Any] = {"error_type": type(exc).__name__}
    response = getattr(exc, "response", None)
    if isinstance(response, Mapping):
        error_data = response.get("Error")
        if isinstance(error_data, Mapping):
            code = error_data.get("Code")
            if code:
                fields["error_code"] = redact_text(code)
        metadata = response.get("ResponseMetadata")
        if isinstance(metadata, Mapping):
            status_code = metadata.get("HTTPStatusCode")
            if status_code:
                fields["status_code"] = status_code
    return fields


def safe_exception_summary(exc: BaseException) -> str:
    """Compact exception summary without provider message text."""

    fields = safe_exception_fields(exc)
    parts = [f"error_type={fields['error_type']}"]
    if fields.get("error_code"):
        parts.append(f"error_code={fields['error_code']}")
    if fields.get("status_code"):
        parts.append(f"status_code={fields['status_code']}")
    return " ".join(parts)
