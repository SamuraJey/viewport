"""Celery application configuration"""

import logging

from celery import Celery
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


settings = CelerySettings()

celery_app = Celery(
    "viewport",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=["viewport.background_tasks"],
)

celery_app.conf.update(
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

__all__ = ["celery_app"]
