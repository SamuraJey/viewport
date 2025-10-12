"""Celery application configuration"""

from src.viewport.background_tasks import celery_app

__all__ = ["celery_app"]
