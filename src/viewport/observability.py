"""OpenTelemetry setup for Viewport.

The application remains safe-disabled by default. When enabled, telemetry exports
through OTLP to a collector; exporter failures are logged and must not block app
or worker startup.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from opentelemetry.sdk.trace import SpanProcessor
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from viewport.telemetry_safety import redact_text, sanitize_span_attributes, sanitize_span_name

if TYPE_CHECKING:  # pragma: no cover
    from fastapi import FastAPI
    from opentelemetry.sdk.trace import ReadableSpan, Span

logger = logging.getLogger(__name__)

_CONFIGURED = False
_CELERY_INSTRUMENTED = False
_DB_INSTRUMENTED = False


class ObservabilitySettings(BaseSettings):
    enabled: bool = Field(default=False, alias="OTEL_ENABLED")
    service_name: str = Field(default="viewport-api", alias="OTEL_SERVICE_NAME")
    service_version: str = Field(default="dev", alias="SERVICE_VERSION")
    environment: str = Field(default="local", alias="DEPLOYMENT_ENVIRONMENT")
    otlp_endpoint: str | None = Field(default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    traces_exporter: str = Field(default="otlp", alias="OTEL_TRACES_EXPORTER")
    sample_ratio: float = Field(default=1.0, alias="OTEL_TRACES_SAMPLE_RATIO")
    instrument_sqlalchemy: bool = Field(default=True, alias="OTEL_INSTRUMENT_SQLALCHEMY")
    instrument_redis: bool = Field(default=True, alias="OTEL_INSTRUMENT_REDIS")
    instrument_celery: bool = Field(default=True, alias="OTEL_INSTRUMENT_CELERY")
    instrument_botocore: bool = Field(default=True, alias="OTEL_INSTRUMENT_BOTOCORE")
    instrument_logging: bool = Field(default=True, alias="OTEL_INSTRUMENT_LOGGING")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


class PrivacySanitizingSpanProcessor(SpanProcessor):
    """Final defense-in-depth sanitizer for auto-instrumented spans.

    FastAPI/ASGI instrumentation creates HTTP attributes before application
    routing and may include raw paths, query strings, IP addresses, or
    User-Agent values. Hooks can overwrite some fields, but a span processor
    ensures the exported ``ReadableSpan`` is sanitized after all instrumentation
    updates are complete.
    """

    def on_start(self, span: "Span", parent_context=None) -> None:  # type: ignore[no-untyped-def]
        return None

    def on_end(self, span: "ReadableSpan") -> None:
        _sanitize_readable_span(span)

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


@lru_cache(maxsize=1)
def get_observability_settings() -> ObservabilitySettings:
    return ObservabilitySettings()


def build_resource_attributes(settings: ObservabilitySettings | None = None, *, service_name: str | None = None) -> dict[str, str]:
    resolved = settings or get_observability_settings()
    return {
        "service.name": service_name or resolved.service_name,
        "service.version": resolved.service_version,
        "deployment.environment": resolved.environment,
    }


def configure_observability(app: "FastAPI | None" = None, *, service_name: str | None = None, settings: ObservabilitySettings | None = None) -> bool:
    """Configure OpenTelemetry tracing/log correlation if enabled.

    Returns True when configuration was attempted and completed, False when the
    feature is disabled. Any setup exception is swallowed after logging because
    observability must never be a production traffic dependency.
    """

    resolved = settings or get_observability_settings()
    if not resolved.enabled:
        return False

    try:
        _configure_tracer_provider(resolved, service_name=service_name)
        if app is not None:
            _instrument_fastapi(app)
        _instrument_common_libraries(resolved)
        logger.info("OpenTelemetry configured", extra={"otel_enabled": True, "service_name": service_name or resolved.service_name})
        return True
    except Exception:
        logger.exception("OpenTelemetry setup failed; continuing without telemetry export")
        return False


def configure_celery_observability(*, service_name: str = "viewport-celery", settings: ObservabilitySettings | None = None) -> bool:
    resolved = settings or get_observability_settings()
    if not resolved.enabled:
        return False
    try:
        _configure_tracer_provider(resolved, service_name=service_name)
        _instrument_common_libraries(resolved, include_celery=True)
        logger.info("Celery OpenTelemetry configured", extra={"otel_enabled": True, "service_name": service_name})
        return True
    except Exception:
        logger.exception("Celery OpenTelemetry setup failed; continuing without telemetry export")
        return False


def _configure_tracer_provider(settings: ObservabilitySettings, *, service_name: str | None = None) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

    resource = Resource.create(build_resource_attributes(settings, service_name=service_name))
    sampler_ratio = min(max(settings.sample_ratio, 0.0), 1.0)
    provider = TracerProvider(resource=resource, sampler=ParentBased(TraceIdRatioBased(sampler_ratio)))
    provider.add_span_processor(PrivacySanitizingSpanProcessor())  # type: ignore[arg-type]

    if settings.traces_exporter.lower() == "console":
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    else:
        endpoint = settings.otlp_endpoint or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
        if not endpoint:
            logger.warning("OTEL_ENABLED is true but no OTLP endpoint is configured; spans will not be exported")
        else:
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=_endpoint_is_insecure(endpoint))))

    trace.set_tracer_provider(provider)
    _CONFIGURED = True


def _instrument_fastapi(app: "FastAPI") -> None:
    if getattr(app.state, "viewport_otel_instrumented", False):
        return
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="/metrics",
        server_request_hook=_sanitize_server_span,
        http_capture_headers_server_request=[],
        http_capture_headers_server_response=[],
        http_capture_headers_sanitize_fields=[".*"],
    )
    app.state.viewport_otel_instrumented = True


def _sanitize_server_span(span: Any, scope: dict[str, Any]) -> None:
    """Sanitize initial server-span attributes before request handling."""

    if not span or not span.is_recording():
        return
    raw_path = scope.get("path")
    if raw_path:
        safe_path = sanitize_span_name(str(raw_path))
        span.set_attribute("http.target", safe_path)
        span.set_attribute("url.path", safe_path)
    headers = scope.get("headers")
    if isinstance(headers, list):
        for key, value in headers:
            if key == b"user-agent":
                span.set_attribute("http.user_agent", sanitize_span_attributes({"http.user_agent": value.decode(errors="ignore")})["http.user_agent"])
                break
    client = scope.get("client")
    if isinstance(client, tuple) and client:
        span.set_attribute("client.address", sanitize_span_attributes({"client.address": client[0]})["client.address"])


def _instrument_common_libraries(settings: ObservabilitySettings, *, include_celery: bool = False) -> None:
    if settings.instrument_logging:
        _instrument_logging()
    if settings.instrument_redis:
        _instrument_redis()
    if settings.instrument_botocore:
        _instrument_botocore()
    if settings.instrument_sqlalchemy:
        _instrument_sqlalchemy()
    if include_celery and settings.instrument_celery:
        _instrument_celery()


def _instrument_logging() -> None:
    try:
        from opentelemetry.instrumentation.logging import LoggingInstrumentor

        LoggingInstrumentor().instrument(set_logging_format=False)
    except Exception:
        logger.debug("OpenTelemetry logging instrumentation unavailable", exc_info=True)


def _instrument_redis() -> None:
    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor

        RedisInstrumentor().instrument()
    except Exception:
        logger.debug("OpenTelemetry Redis instrumentation unavailable", exc_info=True)


def _instrument_botocore() -> None:
    try:
        from opentelemetry.instrumentation.botocore import BotocoreInstrumentor

        BotocoreInstrumentor().instrument()
    except Exception:
        logger.debug("OpenTelemetry botocore instrumentation unavailable", exc_info=True)


def _instrument_celery() -> None:
    global _CELERY_INSTRUMENTED
    if _CELERY_INSTRUMENTED:
        return
    try:
        from opentelemetry.instrumentation.celery import CeleryInstrumentor

        CeleryInstrumentor().instrument()
        _CELERY_INSTRUMENTED = True
    except Exception:
        logger.debug("OpenTelemetry Celery instrumentation unavailable", exc_info=True)


def _instrument_sqlalchemy() -> None:
    global _DB_INSTRUMENTED
    if _DB_INSTRUMENTED:
        return
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        from viewport.models.db import get_engine, get_sync_engine

        async_engine = get_engine()
        sync_engine = getattr(async_engine, "sync_engine", None)
        if sync_engine is not None:
            SQLAlchemyInstrumentor().instrument(engine=sync_engine)
        SQLAlchemyInstrumentor().instrument(engine=get_sync_engine())
        _DB_INSTRUMENTED = True
    except Exception:
        logger.debug("OpenTelemetry SQLAlchemy instrumentation unavailable", exc_info=True)


def _endpoint_is_insecure(endpoint: str) -> bool:
    return endpoint.startswith("http://") or endpoint.startswith("localhost") or endpoint.startswith("127.0.0.1")


def _sanitize_readable_span(span: "ReadableSpan") -> None:
    """Mutate SDK ReadableSpan internals before exporters read it."""

    try:
        current_name = getattr(span, "_name", None)
        if current_name:
            span._name = sanitize_span_name(str(current_name))

        raw_attributes = getattr(span, "_attributes", None)
        if raw_attributes:
            safe_attributes = sanitize_span_attributes(raw_attributes)
            raw_attributes.clear()
            raw_attributes.update({key: value for key, value in safe_attributes.items() if value is not None})

        status: Any = getattr(span, "_status", None)
        description = getattr(status, "_description", None)
        if description:
            status._description = redact_text(description)

        for event in getattr(span, "_events", ()) or ():
            event_attributes = getattr(event, "_attributes", None)
            if event_attributes:
                safe_event_attributes = sanitize_span_attributes(event_attributes)
                event_attributes.clear()
                event_attributes.update({key: value for key, value in safe_event_attributes.items() if value is not None})
    except Exception:
        logger.debug("Unable to sanitize OpenTelemetry span before export", exc_info=True)


__all__ = [
    "ObservabilitySettings",
    "PrivacySanitizingSpanProcessor",
    "build_resource_attributes",
    "configure_celery_observability",
    "configure_observability",
    "get_observability_settings",
]
