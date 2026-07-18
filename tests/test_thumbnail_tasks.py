from uuid import uuid4

from viewport.thumbnail_tasks import THUMBNAIL_TASK_BATCH_SIZE, ThumbnailTaskItem, chunk_thumbnail_task_payloads, to_thumbnail_task_payloads


def test_chunk_thumbnail_task_payloads_uses_bounded_ordered_batches() -> None:
    items = [ThumbnailTaskItem(uuid4(), f"gallery/photo-{index}.jpg") for index in range(THUMBNAIL_TASK_BATCH_SIZE * 2 + 1)]
    payloads = to_thumbnail_task_payloads(items)

    batches = list(chunk_thumbnail_task_payloads(payloads))

    assert [len(batch) for batch in batches] == [THUMBNAIL_TASK_BATCH_SIZE, THUMBNAIL_TASK_BATCH_SIZE, 1]
    assert [payload for batch in batches for payload in batch] == payloads


def test_chunk_thumbnail_task_payloads_yields_no_empty_batch() -> None:
    assert list(chunk_thumbnail_task_payloads([])) == []
