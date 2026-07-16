from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import TypedDict
from uuid import UUID

THUMBNAIL_TASK_BATCH_SIZE = 10


class ThumbnailTaskPayload(TypedDict):
    """JSON-serializable wire payload consumed by the thumbnail Celery task."""

    photo_id: str
    object_key: str


@dataclass(frozen=True, slots=True)
class ThumbnailTaskItem:
    """Typed in-process representation for thumbnail work before Celery serialization."""

    photo_id: UUID | str
    object_key: str

    def to_payload(self) -> ThumbnailTaskPayload:
        return {
            "photo_id": str(self.photo_id),
            "object_key": self.object_key,
        }


def to_thumbnail_task_payloads(items: Iterable[ThumbnailTaskItem]) -> list[ThumbnailTaskPayload]:
    """Serialize typed thumbnail work items to Celery-compatible dictionaries."""

    return [item.to_payload() for item in items]


def chunk_thumbnail_task_payloads(payloads: Sequence[ThumbnailTaskPayload]) -> Iterator[list[ThumbnailTaskPayload]]:
    """Yield bounded Celery payload batches while preserving input order."""

    for start in range(0, len(payloads), THUMBNAIL_TASK_BATCH_SIZE):
        yield list(payloads[start : start + THUMBNAIL_TASK_BATCH_SIZE])
