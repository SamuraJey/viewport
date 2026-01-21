"""Celery application configuration"""

import logging
from typing import Optional

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


# Lazy initialization: celery_app is created on first access
_celery_app: Optional[Celery] = None


def _get_celery_app() -> Celery:
    """Get the global celery_app instance, creating it lazily if needed.
    
    Lazy initialization ensures environment variables (e.g., from test fixtures)
    are read when the app is created, not at module import time.
    """
    global _celery_app
    if _celery_app is None:
        _celery_app = create_celery_app()
    return _celery_app


class _CeleryAppProxy:
    """Proxy that forwards all attribute access to the lazily-initialized Celery app.
    
    This proxy allows the celery_app module variable to be imported at any time
    without immediately creating the Celery application instance. The actual app
    is only created on first attribute access, ensuring that environment variables
    (such as those set by test fixtures) are read at the right time.
    
    This pattern is useful for testing: test fixtures can set environment variables
    before the Celery app reads its configuration, avoiding the need for module
    reloading or runtime reconfiguration.
    """
    
    def __getattr__(self, name: str):
        """Forward attribute access to the underlying Celery app."""
        return getattr(_get_celery_app(), name)
    
    def __setattr__(self, name: str, value):
        """Forward attribute assignment to the underlying Celery app."""
        return setattr(_get_celery_app(), name, value)
    
    def __dir__(self):
        """Forward directory listing to the underlying Celery app."""
        return dir(_get_celery_app())


# Create the proxy instance that will lazily initialize the actual Celery app
celery_app = _CeleryAppProxy()


__all__ = ["celery_app", "create_celery_app"]
