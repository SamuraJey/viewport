import json
import logging
from types import SimpleNamespace

from botocore.exceptions import ClientError
from starlette.requests import Request

import viewport.background_tasks as background_tasks
from viewport.logger import StructuredLogger
from viewport.logging_config import JsonFormatter, reset_request_id, set_request_id
from viewport.observability import PrivacySanitizingSpanProcessor
from viewport.s3_service import _safe_s3_errors
from viewport.sharelink_access import _log_denied_password_attempt
from viewport.telemetry_safety import REDACTED, fingerprint_value, redact_text, safe_exception_summary, user_agent_family


def _json_for_record(message: str, *args, **extra):
    record = logging.LogRecord("viewport.test", logging.INFO, __file__, 1, message, args, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return json.loads(JsonFormatter().format(record))


def test_json_formatter_redacts_sensitive_text_and_adds_context(monkeypatch):
    monkeypatch.setenv("LOG_FORMAT", "json")
    monkeypatch.setenv("OTEL_SERVICE_NAME", "viewport-api")
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT", "pytest")
    monkeypatch.setenv("SERVICE_VERSION", "test-sha")
    token = set_request_id("req-123")
    try:
        payload = _json_for_record(
            "Authorization: Bearer abc.def.ghi password=hunter2 X-Amz-Signature=abcdef from 203.0.113.10",
        )
    finally:
        reset_request_id(token)

    assert payload["service.name"] == "viewport-api"
    assert payload["environment"] == "pytest"
    assert payload["service.version"] == "test-sha"
    assert payload["request_id"] == "req-123"
    assert "abc.def.ghi" not in payload["message"]
    assert "hunter2" not in payload["message"]
    assert "abcdef" not in payload["message"]
    assert "203.0.113.10" not in payload["message"]
    assert REDACTED in payload["message"]


def test_json_formatter_redacts_structured_sensitive_fields():
    raw_key = "gallery-uuid/private/customer-file.jpg"
    gallery_id = "22222222-2222-2222-2222-222222222222"
    client_email = "client@example.com"
    client_name = "Sensitive Client"
    payload = _json_for_record(
        "structured event",
        structured_fields={
            "event": "upload",
            "gallery_id": gallery_id,
            "client_email": client_email,
            "client_name": client_name,
            "object_key": raw_key,
            "client_ip": "198.51.100.25",
            "user_agent": "Mozilla/5.0 Firefox/124.0",
            "cookie": "session=secret",
            "password": "share-password",
        },
    )

    rendered = json.dumps(payload)
    assert raw_key not in rendered
    assert "198.51.100.25" not in rendered
    assert "Mozilla/5.0" not in rendered
    assert "session=secret" not in rendered
    assert "share-password" not in rendered
    assert gallery_id not in rendered
    assert client_email not in rendered
    assert client_name not in rendered
    assert payload["gallery_id"].startswith("sha256:")
    assert payload["client_email"].startswith("sha256:")
    assert payload["client_name"].startswith("sha256:")
    assert payload["object_key"].startswith("sha256:")
    assert payload["client_ip"].startswith("sha256:")
    assert payload["user_agent"] == "firefox"
    assert payload["cookie"] == REDACTED
    assert payload["password"] == REDACTED


def test_structured_logger_emits_safe_structured_fields(caplog):
    structured_logger = StructuredLogger("viewport.structured-test")

    with caplog.at_level(logging.INFO, logger="viewport.structured-test"):
        structured_logger.log_event(
            "download_zip",
            share_id="secret-share-token",
            extra={"object_key": "gallery/customer-file.jpg", "photo_count": 3},
        )

    record = caplog.records[-1]
    fields = record.structured_fields
    assert record.getMessage() == "download_zip"
    assert fields["event"] == "download_zip"
    assert fields["share_id"].startswith("sha256:")
    assert fields["object_key"].startswith("sha256:")
    assert "secret-share-token" not in json.dumps(fields)
    assert "customer-file.jpg" not in json.dumps(fields)


def test_sharelink_denied_password_attempt_omits_raw_ip_user_agent_and_share_id(caplog):
    share_id = "11111111-1111-1111-1111-111111111111"
    sharelink = SimpleNamespace(id=share_id, scope_type="gallery")
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": f"/s/{share_id}/unlock",
            "headers": [(b"user-agent", b"Mozilla/5.0 Chrome/124.0")],
            "client": ("203.0.113.55", 12345),
            "scheme": "https",
            "server": ("example.test", 443),
        }
    )

    with caplog.at_level(logging.INFO, logger="viewport"):
        _log_denied_password_attempt(sharelink, request, reason="password_failed")

    fields = caplog.records[-1].structured_fields
    rendered = json.dumps(fields)
    assert share_id not in rendered
    assert "203.0.113.55" not in rendered
    assert "Mozilla/5.0" not in rendered
    assert fields["share_id_hash"] == fingerprint_value(share_id)
    assert fields["client_ip_hash"] == fingerprint_value("203.0.113.55")
    assert fields["user_agent_family"] == user_agent_family("Mozilla/5.0 Chrome/124.0")
    assert fields["route"] == "/s/{share_id}"


def test_redact_text_presigned_url_and_token_safety_net():
    raw_key = "customer/gallery/private-file.jpg"
    text = f"url=https://s3.test/key?X-Amz-Signature=sig&AWSAccessKeyId=key token=secret cookie=session email=client@example.com message='Access denied for {raw_key}'"
    redacted = redact_text(text)
    assert "sig" not in redacted
    assert "AWSAccessKeyId=key" not in redacted
    assert "token=secret" not in redacted
    assert "cookie=session" not in redacted
    assert "client@example.com" not in redacted
    assert raw_key not in redacted


def test_redact_text_normalizes_access_log_share_route_and_uuids():
    share_id = "11111111-1111-1111-1111-111111111111"
    gallery_id = "22222222-2222-2222-2222-222222222222"
    payload = _json_for_record(
        '203.0.113.7:123 - "GET /s/%s/galleries/%s?token=secret HTTP/1.1" 200',
        share_id,
        gallery_id,
    )

    rendered = json.dumps(payload)
    assert share_id not in rendered
    assert gallery_id not in rendered
    assert "203.0.113.7" not in rendered
    assert "token=secret" not in rendered
    assert "/s/{share_id}/galleries/{gallery_id}" in payload["message"]


def test_span_processor_sanitizes_raw_http_attributes_before_export():
    from opentelemetry.sdk.trace import ReadableSpan

    share_id = "11111111-1111-1111-1111-111111111111"
    span = ReadableSpan(
        name=f"GET /s/{share_id}/download/all",
        attributes={
            "http.target": f"/s/{share_id}/download/all?token=secret",
            "http.url": f"https://example.test/s/{share_id}/download/all?X-Amz-Signature=sig",
            "url.path": f"/s/{share_id}/download/all",
            "url.query": "token=secret",
            "http.user_agent": "Mozilla/5.0 Chrome/124.0",
            "user_agent.original": "Mozilla/5.0 Chrome/124.0",
            "net.peer.ip": "203.0.113.55",
            "client.address": "203.0.113.55",
            "db.statement": "select * from share_links where id='11111111-1111-1111-1111-111111111111'",
        },
    )

    PrivacySanitizingSpanProcessor().on_end(span)
    rendered = json.dumps({"name": span.name, "attributes": dict(span.attributes)})

    assert share_id not in rendered
    assert "203.0.113.55" not in rendered
    assert "Mozilla/5.0" not in rendered
    assert "token=secret" not in rendered
    assert "X-Amz-Signature=sig" not in rendered
    assert span.name == "GET /s/{share_id}/download/all"
    assert span.attributes["http.target"] == "/s/{share_id}/download/all"
    assert span.attributes["url.query"] == REDACTED
    assert span.attributes["http.user_agent"] == "chrome"
    assert span.attributes["client.address"].startswith("sha256:")
    assert span.attributes["db.statement"] == REDACTED


def test_span_processor_sanitizes_exported_spans():
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    share_id = "11111111-1111-1111-1111-111111111111"
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(PrivacySanitizingSpanProcessor())
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    tracer = provider.get_tracer("viewport-test")
    with tracer.start_as_current_span(
        f"GET /s/{share_id}",
        attributes={
            "http.target": f"/s/{share_id}?token=secret",
            "client.address": "203.0.113.55",
            "user_agent.original": "Mozilla/5.0 Firefox/124.0",
        },
    ):
        pass

    span = exporter.get_finished_spans()[0]
    rendered = json.dumps({"name": span.name, "attributes": dict(span.attributes)})
    assert share_id not in rendered
    assert "203.0.113.55" not in rendered
    assert "Mozilla/5.0" not in rendered
    assert span.name == "GET /s/{share_id}"
    assert span.attributes["http.target"] == "/s/{share_id}"
    assert span.attributes["client.address"].startswith("sha256:")
    assert span.attributes["user_agent.original"] == "firefox"


def test_s3_partial_delete_errors_use_key_hashes_only():
    raw_key = "customer/gallery/private-file.jpg"
    safe_errors = _safe_s3_errors([{"Key": raw_key, "Code": "AccessDenied", "Message": f"Access denied for {raw_key}"}])
    rendered = json.dumps(safe_errors)

    assert raw_key not in rendered
    assert "Access denied" not in rendered
    assert safe_errors[0]["message"] == REDACTED
    assert safe_errors[0]["key_hash"].startswith("sha256:")


def test_background_s3_partial_delete_errors_use_key_hashes_only():
    raw_key = "customer/gallery/private-file.jpg"
    safe_errors = background_tasks._safe_s3_errors([{"Key": raw_key, "Code": "AccessDenied", "Message": f"Access denied for {raw_key}"}])
    rendered = json.dumps(safe_errors)

    assert raw_key not in rendered
    assert "Access denied" not in rendered
    assert safe_errors[0]["message"] == REDACTED
    assert safe_errors[0]["key_hash"].startswith("sha256:")


def test_s3_exception_summary_omits_provider_message_with_object_key():
    raw_key = "customer/gallery/private-file.jpg"
    error = ClientError(
        {
            "Error": {"Code": "AccessDenied", "Message": f"Access denied for {raw_key}"},
            "ResponseMetadata": {"HTTPStatusCode": 403},
        },
        "DeleteObject",
    )

    summary = safe_exception_summary(error)
    payload = _json_for_record("Failed S3 operation key_hash=%s: %s", fingerprint_value(raw_key), summary)
    rendered = json.dumps(payload)

    assert raw_key not in summary
    assert "Access denied" not in summary
    assert raw_key not in rendered
    assert "Access denied" not in rendered
    assert "error_type=ClientError" in summary
    assert "error_code=AccessDenied" in summary
    assert "status_code=403" in summary


def test_selection_submit_notification_log_uses_pii_hashes(monkeypatch, caplog):
    class DummyRedis:
        is_available = False

        async def close(self):
            return None

    async def create_dummy_redis():
        return DummyRedis()

    monkeypatch.setattr(background_tasks.RedisService, "create", create_dummy_redis)
    payload = {
        "sharelink_id": "11111111-1111-1111-1111-111111111111",
        "session_id": "selection-session-secret",
        "client_name": "Sensitive Client",
        "client_email": "client@example.com",
        "selected_count": 5,
        "submitted_at": "2026-05-07T00:00:00Z",
    }

    with caplog.at_level(logging.INFO, logger="viewport.background_tasks"):
        result = background_tasks.notify_selection_submitted_task.run(payload)

    assert result == {"sent": True, "deduped": False}
    rendered = JsonFormatter().format(caplog.records[-1])
    assert payload["sharelink_id"] not in rendered
    assert payload["session_id"] not in rendered
    assert payload["client_name"] not in rendered
    assert payload["client_email"] not in rendered
    assert "sharelink_id_hash" in rendered
    assert "client_email_hash" in rendered
