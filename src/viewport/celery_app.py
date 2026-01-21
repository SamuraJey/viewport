"""Celery application configuration"""

import logging

from celery import Celery
from celery.schedules import crontab
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class CelerySettings(BaseSettings):
    broker_url: str = Field(default="redis://localhost:6379/0", alias="CELERY_BROKER_URL")
    result_backend: str = Field(default="redis://localhost:6379/0", alias="CELERY_RESULT_BACKEND")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


def _get_celery_settings() -> CelerySettings:
    """Get Celery settings, reading from environment variables."""
    return CelerySettings()


def create_celery_app() -> Celery:
    """Create and configure the Celery application.
    
    This function creates a new Celery app instance with settings from the environment.
    It can be called multiple times to get fresh configuration (useful for testing).
    """
    settings = _get_celery_settings()
    
    app = Celery(
        "viewport",
        broker=settings.broker_url,
        backend=settings.result_backend,
        include=["viewport.background_tasks"],
    )
    
    app.conf.update(
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
        # Connection pool settings to prevent Redis connection exhaustion
        broker_pool_limit=None,  # No limit on broker connections (use Redis connection pooling)
        broker_connection_retry_on_startup=True,  # Retry connection on startup
        broker_connection_max_retries=10,  # Retry up to 10 times
    )
    
    app.conf.beat_schedule = {
        "cleanup-orphaned-uploads-every-hour": {
            "task": "cleanup_orphaned_uploads",
            "schedule": crontab(minute=0),  # Top of every hour
        },
    }
    
    return app


# Create the default celery app instance
celery_app = create_celery_app()


def reconfigure_celery_for_tests(broker_url: str, result_backend: str) -> None:
    """Reconfigure the global celery_app for testing.
    
    This updates the broker and backend URLs dynamically without requiring module reloading.
    Should only be called from test fixtures before any tasks are executed.
    """
    global celery_app
    celery_app.conf.update(
        broker_url=broker_url,
        result_backend=result_backend,
    )
    logger.info("Reconfigured Celery app for tests: broker=%s, backend=%s", broker_url, result_backend)


__all__ = ["celery_app", "create_celery_app", "reconfigure_celery_for_tests"]
