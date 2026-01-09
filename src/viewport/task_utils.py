import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from sqlalchemy.orm import Session

from viewport.models.db import get_session_maker

logger = logging.getLogger(__name__)


@contextmanager
def task_db_session() -> Generator[Session]:
    """Context manager for database sessions in Celery tasks."""
    session_maker = get_session_maker()
    with session_maker() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


class BatchTaskResult:
    """Helper to track results of a batch task."""

    def __init__(self, total: int):
        self.total = total
        self.successful = 0
        self.skipped = 0
        self.failed = 0
        self.results: list[dict[str, Any]] = []

    def add_success(self, photo_id: str, **kwargs: Any) -> None:
        self.successful += 1
        self.results.append({"photo_id": photo_id, "status": "success", **kwargs})

    def add_skipped(self, photo_id: str, message: str) -> None:
        self.skipped += 1
        self.results.append({"photo_id": photo_id, "status": "skipped", "message": message})

    def add_error(self, photo_id: str, message: str, exception: Exception | None = None) -> None:
        self.failed += 1
        result = {"photo_id": photo_id, "status": "error", "message": message}
        if exception:
            result["exception"] = str(exception)
        self.results.append(result)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "complete",
            "total": self.total,
            "successful": self.successful,
            "skipped": self.skipped,
            "failed": self.failed,
            "results": self.results,
        }
