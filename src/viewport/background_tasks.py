import asyncio
import inspect
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any, cast

import viewport.tasks.photo_tasks as _photo_tasks
from viewport.tasks.maintenance_tasks import (
    _release_reserved_for_photos,
    cleanup_orphaned_uploads_task_impl,
    delete_gallery_data_task_impl,
    reconcile_storage_quotas_task_impl,
    reconcile_successful_uploads_task_impl,
)
from viewport.tasks.maintenance_tasks import cleanup_orphaned_uploads_task as _cleanup_orphaned_uploads_task
from viewport.tasks.maintenance_tasks import delete_gallery_data_task as _delete_gallery_data_task
from viewport.tasks.maintenance_tasks import reconcile_storage_quotas_task as _reconcile_storage_quotas_task
from viewport.tasks.maintenance_tasks import reconcile_successful_uploads_task as _reconcile_successful_uploads_task
from viewport.tasks.photo_tasks import (
    _batch_update_photo_results,
    _decrement_used_for_photos,
    _get_existing_photo_ids,
    _is_valid_image,
    _process_single_photo,
    create_thumbnails_batch_task_impl,
    delete_photo_data_task_impl,
)
from viewport.tasks.photo_tasks import create_thumbnails_batch_task as _create_thumbnails_batch_task
from viewport.tasks.photo_tasks import delete_photo_data_task as _delete_photo_data_task


class TaskCompat:
    def __init__(
        self,
        task_obj: Any,
        run_impl: Callable[..., Any],
        enqueue_impl: Callable[..., Awaitable[Any]] | None = None,
    ) -> None:
        self._task_obj = task_obj
        self._run_impl = run_impl
        self._enqueue_impl = enqueue_impl

    async def kiq(self, *args: Any, **kwargs: Any) -> Any:
        return await self._task_obj.kiq(*args, **kwargs)

    def run(self, *args: Any, **kwargs: Any) -> Any:
        result = self._run_impl(*args, **kwargs)
        if inspect.isawaitable(result):
            return asyncio.run(cast(Coroutine[Any, Any, Any], result))
        return result

    def delay(self, *args: Any, **kwargs: Any) -> Any:
        if self._enqueue_impl is not None:
            enqueue_call = self._enqueue_impl(*args, **kwargs)
        else:
            enqueue_call = self._task_obj.kiq(*args, **kwargs)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(cast(Coroutine[Any, Any, Any], enqueue_call))
        return loop.create_task(cast(Coroutine[Any, Any, Any], enqueue_call))

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.run(*args, **kwargs)


def _create_thumbnails_batch_task_run_impl(photos: list[dict]) -> Coroutine[Any, Any, dict[str, Any]]:
    _photo_tasks._is_valid_image = _is_valid_image
    _photo_tasks._get_existing_photo_ids = _get_existing_photo_ids
    _photo_tasks._process_single_photo = _process_single_photo
    _photo_tasks._batch_update_photo_results = _batch_update_photo_results
    return create_thumbnails_batch_task_impl(photos)


async def _enqueue_create_thumbnails_batch(photos: list[dict]) -> Any:
    return await _create_thumbnails_batch_task.kiq(photos)


async def _enqueue_cleanup_orphaned_uploads() -> Any:
    return await _cleanup_orphaned_uploads_task.kiq()


async def _enqueue_delete_gallery_data(gallery_id: str) -> Any:
    return await _delete_gallery_data_task.kiq(gallery_id)


async def _enqueue_delete_photo_data(photo_id: str, gallery_id: str, owner_id: str) -> Any:
    return await _delete_photo_data_task.kiq(photo_id, gallery_id, owner_id)


async def _enqueue_reconcile_storage_quotas() -> Any:
    return await _reconcile_storage_quotas_task.kiq()


async def _enqueue_reconcile_successful_uploads() -> Any:
    return await _reconcile_successful_uploads_task.kiq()


create_thumbnails_batch_task = TaskCompat(_create_thumbnails_batch_task, _create_thumbnails_batch_task_run_impl, _enqueue_create_thumbnails_batch)
cleanup_orphaned_uploads_task = TaskCompat(_cleanup_orphaned_uploads_task, cleanup_orphaned_uploads_task_impl, _enqueue_cleanup_orphaned_uploads)
delete_gallery_data_task = TaskCompat(_delete_gallery_data_task, delete_gallery_data_task_impl, _enqueue_delete_gallery_data)
delete_photo_data_task = TaskCompat(_delete_photo_data_task, delete_photo_data_task_impl, _enqueue_delete_photo_data)
reconcile_storage_quotas_task = TaskCompat(_reconcile_storage_quotas_task, reconcile_storage_quotas_task_impl, _enqueue_reconcile_storage_quotas)
reconcile_successful_uploads_task = TaskCompat(
    _reconcile_successful_uploads_task,
    reconcile_successful_uploads_task_impl,
    _enqueue_reconcile_successful_uploads,
)

__all__ = [
    "create_thumbnails_batch_task",
    "cleanup_orphaned_uploads_task",
    "delete_gallery_data_task",
    "delete_photo_data_task",
    "reconcile_storage_quotas_task",
    "reconcile_successful_uploads_task",
    "_is_valid_image",
    "_get_existing_photo_ids",
    "_process_single_photo",
    "_batch_update_photo_results",
    "_release_reserved_for_photos",
    "_decrement_used_for_photos",
]
