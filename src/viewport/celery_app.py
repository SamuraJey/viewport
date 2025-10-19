"""Celery application configuration"""

from viewport.background_tasks import celery_app  # pragma: no cover

__all__ = ["celery_app"]  # pragma: no cover
