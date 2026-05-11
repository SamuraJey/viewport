from __future__ import annotations

import contextvars
import json
import logging
import os
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from logging import config as logging_config
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from viewport.telemetry_safety import redact_mapping, redact_text

_request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("viewport_request_id", default=None)
_task_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("viewport_task_id", default=None)


def get_request_id() -> str | None:
    return _request_id_ctx.get()


def set_request_id(request_id: str | None) -> contextvars.Token[str | None]:
    return _request_id_ctx.set(request_id)


def reset_request_id(token: contextvars.Token[str | None]) -> None:
    _request_id_ctx.reset(token)


def get_task_id() -> str | None:
    return _task_id_ctx.get()


def set_task_id(task_id: str | None) -> contextvars.Token[str | None]:
    return _task_id_ctx.set(task_id)


def reset_task_id(token: contextvars.Token[str | None]) -> None:
    _task_id_ctx.reset(token)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a privacy-safe request correlation ID to logs and responses."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        incoming_id = request.headers.get("x-request-id")
        request_id = _normalize_request_id(incoming_id) or str(uuid.uuid4())
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
        finally:
            reset_request_id(token)
        response.headers["X-Request-ID"] = request_id
        return response


class ColoredFormatter(logging.Formatter):
    """Logging formatter that injects ANSI color codes based on levelname."""

    COLOR_MAP = {
        "DEBUG": "\x1b[36m",
        "INFO": "\x1b[32m",
        "WARNING": "\x1b[33m",
        "ERROR": "\x1b[31m",
        "CRITICAL": "\x1b[41m",
    }
    RESET = "\x1b[0m"

    def __init__(self, fmt: str | None = None, datefmt: str | None = None):
        super().__init__(fmt=fmt, datefmt=datefmt)

    def format(self, record: logging.LogRecord) -> str:
        original_levelname = record.levelname
        color = self.COLOR_MAP.get(original_levelname, "")
        record.levelname = f"{color}{original_levelname}{self.RESET}"
        try:
            return redact_text(super().format(record))
        finally:
            record.levelname = original_levelname


class JsonFormatter(logging.Formatter):
    """One-JSON-object-per-line production formatter with correlation fields."""

    RESERVED_ATTRS = frozenset(logging.makeLogRecord({}).__dict__)

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
            "service.name": os.getenv("OTEL_SERVICE_NAME") or os.getenv("SERVICE_NAME", "viewport-api"),
            "environment": os.getenv("DEPLOYMENT_ENVIRONMENT") or os.getenv("ENVIRONMENT", "local"),
            "service.version": os.getenv("SERVICE_VERSION", "dev"),
            "request_id": getattr(record, "request_id", None) or get_request_id(),
            "task_id": getattr(record, "task_id", None) or get_task_id(),
            "trace_id": _record_trace_id(record),
            "span_id": _record_span_id(record),
        }

        structured_fields = getattr(record, "structured_fields", None)
        if isinstance(structured_fields, dict):
            payload.update(redact_mapping(structured_fields))

        for key, value in record.__dict__.items():
            if key in self.RESERVED_ATTRS or key in {"message", "asctime", "structured_fields"}:
                continue
            if key.startswith("_uvicorn"):
                continue
            payload[key] = value

        payload = redact_mapping({key: val for key, val in payload.items() if val is not None})

        if record.exc_info:
            payload["exc_info"] = redact_text(self.formatException(record.exc_info))
        if record.stack_info:
            payload["stack_info"] = redact_text(self.formatStack(record.stack_info))

        return json.dumps(payload, default=str, separators=(",", ":"), ensure_ascii=False)


class RedactingFilter(logging.Filter):
    """Filter kept for handler compatibility; formatter performs final redaction."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Avoid mutating record.args (which can break logging interpolation). The
        # formatters call redact_text/redact_mapping after interpolation instead.
        return True


def configure_logging(level: str | None = None, log_format: str | None = None) -> None:
    """Configure application logging.

    `LOG_FORMAT=json` is the production ingestion mode. Any other value keeps
    colored human-readable stdout logs for local development.
    """

    resolved_level = (level if level is not None else os.getenv("LOG_LEVEL") or "INFO").upper()
    resolved_format = (log_format if log_format is not None else os.getenv("LOG_FORMAT") or "colored").lower()
    use_json = resolved_format == "json"

    default_fmt = "%(asctime)s %(levelname)-5s [%(name)s] %(message)s"
    access_fmt = "%(asctime)s %(levelname)-5s %(message)s"

    formatter_name = "json" if use_json else "default"
    access_formatter = "json" if use_json else "access"

    cfg = {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"redact": {"()": "viewport.logging_config.RedactingFilter"}},
        "formatters": {
            "default": {"()": "viewport.logging_config.ColoredFormatter", "format": default_fmt, "datefmt": "%Y-%m-%d %H:%M:%S"},
            "access": {"()": "viewport.logging_config.ColoredFormatter", "format": access_fmt, "datefmt": "%Y-%m-%d %H:%M:%S"},
            "json": {"()": "viewport.logging_config.JsonFormatter"},
        },
        "handlers": {
            "default": {"class": "logging.StreamHandler", "formatter": formatter_name, "filters": ["redact"], "stream": "ext://sys.stdout"},
            "access": {"class": "logging.StreamHandler", "formatter": access_formatter, "filters": ["redact"], "stream": "ext://sys.stdout"},
        },
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": resolved_level, "propagate": False},
            "uvicorn.error": {"handlers": ["default"], "level": resolved_level, "propagate": False},
            "uvicorn.access": {"handlers": ["access"], "level": resolved_level, "propagate": False},
        },
        "root": {"handlers": ["default"], "level": resolved_level},
    }

    logging_config.dictConfig(cfg)


def _normalize_request_id(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()[:128]
    if not candidate:
        return None
    if all(ch.isalnum() or ch in "-_.:" for ch in candidate):
        return candidate
    return None


def _record_trace_id(record: logging.LogRecord) -> str | None:
    for attr in ("otelTraceID", "trace_id"):
        val = getattr(record, attr, None)
        if val:
            return str(val)
    return _active_span_attr("trace_id")


def _record_span_id(record: logging.LogRecord) -> str | None:
    for attr in ("otelSpanID", "span_id"):
        val = getattr(record, attr, None)
        if val:
            return str(val)
    return _active_span_attr("span_id")


def _active_span_attr(attr: str) -> str | None:
    try:
        from opentelemetry import trace

        context = trace.get_current_span().get_span_context()
        if not context or not context.is_valid:
            return None
        if attr == "trace_id":
            return f"{context.trace_id:032x}"
        return f"{context.span_id:016x}"
    except Exception:
        return None


__all__ = [
    "ColoredFormatter",
    "JsonFormatter",
    "RedactingFilter",
    "RequestContextMiddleware",
    "configure_logging",
    "get_request_id",
    "get_task_id",
    "reset_request_id",
    "reset_task_id",
    "set_request_id",
    "set_task_id",
]
