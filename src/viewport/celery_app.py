"""Celery application configuration."""

import os
import time

from celery import Celery
from celery.schedules import crontab
from celery.signals import heartbeat_sent, task_failure, task_postrun, task_prerun, task_retry
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from viewport.logging_config import reset_task_id, set_task_id
from viewport.metrics import record_celery_task_event, record_celery_task_runtime, record_celery_worker_heartbeat, start_celery_metrics_server_from_env
from viewport.observability import configure_celery_observability


class CelerySettings(BaseSettings):
    broker_url: str = Field(default="redis://localhost:6379/0", alias="CELERY_BROKER_URL")
    result_backend: str = Field(default="redis://localhost:6379/0", alias="CELERY_RESULT_BACKEND")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


def create_celery_app(settings: CelerySettings | None = None) -> Celery:
    """Create and configure a Celery application instance."""

    if settings is None:
        settings = CelerySettings()

    app = Celery("viewport", include=["viewport.background_tasks"])

    app.conf.update(
        broker_url=settings.broker_url,
        result_backend=settings.result_backend,
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=30 * 60,  # 30 minutes
        task_soft_time_limit=25 * 60,  # 25 minutes
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        broker_pool_limit=None,
        broker_connection_retry_on_startup=True,
        broker_connection_max_retries=10,
    )

    if os.environ.get("ENVIRONMENT") == "pytest":
        app.conf.update(
            task_always_eager=True,
            task_eager_propagates=True,
            task_store_eager_result=False,
            result_backend="cache+memory://",
        )

    # Schedule periodic tasks
    app.conf.beat_schedule = {
        "cleanup-orphaned-uploads-every-hour": {
            "task": "cleanup_orphaned_uploads",
            "schedule": crontab(minute=0),  # Every hour at minute 0
        },
        "reconcile-successful-uploads-every-10-min": {
            "task": "reconcile_successful_uploads",
            "schedule": crontab(minute="*/10"),
        },
        "reconcile-storage-quotas-daily": {
            "task": "reconcile_storage_quotas",
            "schedule": crontab(hour=3, minute=0),  # Daily at 03:00 UTC
        },
    }

    return app


celery_app = create_celery_app()

_TASK_START_TIMES: dict[str, float] = {}
_TASK_CONTEXT_TOKENS: dict[str, object] = {}
_CELERY_SIGNALS_REGISTERED = False


def register_celery_observability(app: Celery) -> None:
    """Register metrics/tracing hooks for Celery workers idempotently."""

    global _CELERY_SIGNALS_REGISTERED
    if _CELERY_SIGNALS_REGISTERED:
        return

    start_celery_metrics_server_from_env()
    configure_celery_observability(service_name="viewport-celery")

    @task_prerun.connect(weak=False)
    def _on_task_prerun(task_id: str | None = None, task=None, **_: object) -> None:
        if task_id:
            _TASK_START_TIMES[task_id] = time.perf_counter()
            _TASK_CONTEXT_TOKENS[task_id] = set_task_id(task_id)
        record_celery_task_event(getattr(task, "name", None), "started")

    @task_postrun.connect(weak=False)
    def _on_task_postrun(task_id: str | None = None, task=None, state: str | None = None, **_: object) -> None:
        normalized_state = _normalize_task_state(state)
        started = _TASK_START_TIMES.pop(task_id, None) if task_id else None
        if started is not None:
            record_celery_task_runtime(getattr(task, "name", None), normalized_state, time.perf_counter() - started)
        record_celery_task_event(getattr(task, "name", None), normalized_state)
        token = _TASK_CONTEXT_TOKENS.pop(task_id, None) if task_id else None
        if token is not None:
            reset_task_id(token)  # type: ignore[arg-type]

    @task_failure.connect(weak=False)
    def _on_task_failure(task_id: str | None = None, sender=None, **_: object) -> None:
        record_celery_task_event(getattr(sender, "name", None), "failed")

    @task_retry.connect(weak=False)
    def _on_task_retry(sender=None, **_: object) -> None:
        record_celery_task_event(getattr(sender, "name", None), "retried")

    @heartbeat_sent.connect(weak=False)
    def _on_worker_heartbeat(sender=None, **_: object) -> None:
        record_celery_worker_heartbeat(getattr(sender, "hostname", None))

    _CELERY_SIGNALS_REGISTERED = True


def _normalize_task_state(state: str | None) -> str:
    if state == "SUCCESS":
        return "succeeded"
    if state == "FAILURE":
        return "failed"
    if state == "RETRY":
        return "retried"
    if state == "REVOKED":
        return "revoked"
    return "unknown"


register_celery_observability(celery_app)

__all__ = ["celery_app", "create_celery_app", "CelerySettings", "register_celery_observability"]
