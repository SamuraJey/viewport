from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Callable
from typing import ParamSpec, TypeVar

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from prometheus_fastapi_instrumentator import Instrumentator

from viewport.telemetry_safety import sanitize_label

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")

UPLOAD_OPERATIONS = {"batch_presigned", "batch_confirm", "quota_reserve", "quota_finalize", "thumbnail_enqueue", "thumbnail_process"}
UPLOAD_OUTCOMES = {"success", "failure", "partial", "quota_exceeded", "invalid", "enqueue_failed"}

SHARE_EVENTS = {"access", "password", "unlock", "download_zip", "selection"}
SHARE_OUTCOMES = {"success", "not_found", "inactive", "expired", "password_required", "password_failed", "unlocked", "forbidden"}

S3_OPERATIONS = {"upload", "download", "delete", "delete_batch", "head", "exists", "rename", "list", "presign_get", "presign_put", "tag", "copy", "get"}
S3_OUTCOMES = {"success", "error", "not_found", "partial", "cache_hit", "cache_miss"}

REDIS_OPERATIONS = {"connect", "ping", "get", "set", "mget", "delete", "sadd", "sunion", "pipeline"}
REDIS_OUTCOMES = {"success", "error", "unavailable", "hit", "miss"}

CACHE_OPERATIONS = {"get", "batch_get", "set", "batch_set", "invalidate", "clear"}
CACHE_OUTCOMES = {"hit", "miss", "success", "error", "unavailable"}

CELERY_STATES = {"started", "succeeded", "failed", "retried", "revoked", "unknown"}
_TASK_NAME_RE = re.compile(r"[^A-Za-z0-9_.:-]")

UPLOAD_EVENTS_TOTAL = Counter(
    "viewport_upload_events_total",
    "Low-cardinality upload/photo pipeline workflow events.",
    ("operation", "outcome"),
)

PUBLIC_SHARE_EVENTS_TOTAL = Counter(
    "viewport_public_share_events_total",
    "Low-cardinality public share access, password, download, and selection outcomes.",
    ("event", "outcome"),
)

S3_OPERATIONS_TOTAL = Counter(
    "viewport_s3_operations_total",
    "S3-compatible object storage operation outcomes without object-key labels.",
    ("operation", "outcome"),
)
S3_OPERATION_DURATION_SECONDS = Histogram(
    "viewport_s3_operation_duration_seconds",
    "S3-compatible object storage operation duration in seconds without object-key labels.",
    ("operation", "outcome"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

REDIS_OPERATIONS_TOTAL = Counter(
    "viewport_redis_operations_total",
    "Redis/Valkey operation outcomes without raw cache-key labels.",
    ("operation", "outcome"),
)
REDIS_OPERATION_DURATION_SECONDS = Histogram(
    "viewport_redis_operation_duration_seconds",
    "Redis/Valkey operation duration in seconds without raw cache-key labels.",
    ("operation", "outcome"),
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)
REDIS_AVAILABLE = Gauge(
    "viewport_redis_available",
    "Redis/Valkey availability as seen by the application (1 available, 0 degraded/unavailable).",
)

PRESIGNED_CACHE_EVENTS_TOTAL = Counter(
    "viewport_presigned_cache_events_total",
    "Presigned URL cache hits/misses/writes/invalidations without raw object-key or cache-key labels.",
    ("operation", "outcome"),
)

CELERY_TASK_EVENTS_TOTAL = Counter(
    "viewport_celery_task_events_total",
    "Celery task lifecycle outcomes by bounded task name.",
    ("task_name", "state"),
)
CELERY_TASK_DURATION_SECONDS = Histogram(
    "viewport_celery_task_duration_seconds",
    "Celery task runtime by bounded task name and terminal state.",
    ("task_name", "state"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 300.0, 900.0, 1800.0),
)
CELERY_WORKER_HEARTBEAT_SECONDS = Gauge(
    "viewport_celery_worker_heartbeat_timestamp_seconds",
    "Last observed Celery worker heartbeat timestamp in seconds since epoch.",
    ("worker",),
)
CELERY_BEAT_HEARTBEAT_SECONDS = Gauge(
    "viewport_celery_beat_heartbeat_timestamp_seconds",
    "Last observed Celery beat schedule heartbeat timestamp in seconds since epoch.",
)

_CELERY_METRICS_SERVER_STARTED = False


def setup_metrics(app) -> None:  # type: ignore[no-untyped-def]
    """Expose Prometheus metrics once for the FastAPI app."""

    state = getattr(app, "state", None)
    if state is not None and getattr(state, "viewport_metrics_configured", False):
        return

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=False,
        excluded_handlers=["/metrics"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

    if state is not None:
        state.viewport_metrics_configured = True


def start_celery_metrics_server_from_env() -> None:
    """Optionally expose worker-process metrics for Prometheus scraping."""

    if os.getenv("CELERY_METRICS_ENABLED", "false").lower() not in {"1", "true", "yes", "on"}:
        return
    port = int(os.getenv("CELERY_METRICS_PORT", "9108"))
    start_celery_metrics_server(port)


def start_celery_metrics_server(port: int) -> None:
    global _CELERY_METRICS_SERVER_STARTED
    if _CELERY_METRICS_SERVER_STARTED:
        return
    start_http_server(port)
    _CELERY_METRICS_SERVER_STARTED = True
    logger.info("Celery Prometheus metrics server started on port %s", port)


def record_upload_event(operation: str, outcome: str) -> None:
    UPLOAD_EVENTS_TOTAL.labels(
        operation=sanitize_label(operation, allowed=UPLOAD_OPERATIONS),
        outcome=sanitize_label(outcome, allowed=UPLOAD_OUTCOMES),
    ).inc()


def record_public_share_event(event: str, outcome: str) -> None:
    PUBLIC_SHARE_EVENTS_TOTAL.labels(
        event=sanitize_label(event, allowed=SHARE_EVENTS),
        outcome=sanitize_label(outcome, allowed=SHARE_OUTCOMES),
    ).inc()


def record_s3_operation(operation: str, outcome: str, duration_seconds: float | None = None) -> None:
    labels = {
        "operation": sanitize_label(operation, allowed=S3_OPERATIONS),
        "outcome": sanitize_label(outcome, allowed=S3_OUTCOMES),
    }
    S3_OPERATIONS_TOTAL.labels(**labels).inc()
    if duration_seconds is not None:
        S3_OPERATION_DURATION_SECONDS.labels(**labels).observe(max(duration_seconds, 0.0))


def record_redis_operation(operation: str, outcome: str, duration_seconds: float | None = None) -> None:
    labels = {
        "operation": sanitize_label(operation, allowed=REDIS_OPERATIONS),
        "outcome": sanitize_label(outcome, allowed=REDIS_OUTCOMES),
    }
    REDIS_OPERATIONS_TOTAL.labels(**labels).inc()
    if duration_seconds is not None:
        REDIS_OPERATION_DURATION_SECONDS.labels(**labels).observe(max(duration_seconds, 0.0))


def set_redis_available(available: bool) -> None:
    REDIS_AVAILABLE.set(1 if available else 0)


def record_presigned_cache_event(operation: str, outcome: str) -> None:
    PRESIGNED_CACHE_EVENTS_TOTAL.labels(
        operation=sanitize_label(operation, allowed=CACHE_OPERATIONS),
        outcome=sanitize_label(outcome, allowed=CACHE_OUTCOMES),
    ).inc()


def record_celery_task_event(task_name: str | None, state: str) -> None:
    CELERY_TASK_EVENTS_TOTAL.labels(
        task_name=_safe_task_name(task_name),
        state=sanitize_label(state, allowed=CELERY_STATES),
    ).inc()


def record_celery_task_runtime(task_name: str | None, state: str, duration_seconds: float) -> None:
    CELERY_TASK_DURATION_SECONDS.labels(
        task_name=_safe_task_name(task_name),
        state=sanitize_label(state, allowed=CELERY_STATES),
    ).observe(max(duration_seconds, 0.0))


def record_celery_worker_heartbeat(worker: str | None = None) -> None:
    CELERY_WORKER_HEARTBEAT_SECONDS.labels(worker=_safe_task_name(worker or "worker")).set(time.time())


def record_celery_beat_heartbeat() -> None:
    CELERY_BEAT_HEARTBEAT_SECONDS.set(time.time())


def timed_s3_operation(operation: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator for sync S3 helpers."""

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
            except Exception:
                record_s3_operation(operation, "error", time.perf_counter() - start)
                raise
            record_s3_operation(operation, "success", time.perf_counter() - start)
            return result

        return wrapper

    return decorator


def _safe_task_name(task_name: str | None) -> str:
    if not task_name:
        return "unknown"
    short = task_name.split(":")[-1].split(".")[-1]
    cleaned = _TASK_NAME_RE.sub("_", short)[:80]
    return cleaned or "unknown"


__all__ = [
    "record_celery_beat_heartbeat",
    "record_celery_task_event",
    "record_celery_task_runtime",
    "record_celery_worker_heartbeat",
    "record_presigned_cache_event",
    "record_public_share_event",
    "record_redis_operation",
    "record_s3_operation",
    "record_upload_event",
    "set_redis_available",
    "setup_metrics",
    "start_celery_metrics_server",
    "start_celery_metrics_server_from_env",
    "timed_s3_operation",
]
