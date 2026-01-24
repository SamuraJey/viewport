"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    }

    return app


celery_app = create_celery_app()

__all__ = ["celery_app", "create_celery_app", "CelerySettings"]
