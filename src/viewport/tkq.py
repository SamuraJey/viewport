import logging
import os
from typing import Any

import taskiq_fastapi
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from taskiq import AsyncBroker, InMemoryBroker, TaskiqEvents, TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from viewport.models.db import get_session_maker
from viewport.s3_service import AsyncS3Client
from viewport.s3_utils import get_s3_settings

logger = logging.getLogger(__name__)


class TaskiqSettings(BaseSettings):
    redis_url: str = Field(default="redis://localhost:6379/0", alias="TASKIQ_REDIS_URL")
    result_ttl_seconds: int = Field(default=3600, alias="TASKIQ_RESULT_TTL_SECONDS")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = TaskiqSettings()
result_backend: RedisAsyncResultBackend | None = None
scheduler: TaskiqScheduler | None = None

# Use InMemoryBroker for testing, RedisStreamBroker for production
env = os.environ.get("ENVIRONMENT")

if env == "pytest":
    # InMemoryBroker for testing: executes tasks synchronously without Redis
    broker: AsyncBroker = InMemoryBroker(await_inplace=True)
else:
    # Production: use Redis for distributed task processing
    result_backend = RedisAsyncResultBackend(
        redis_url=settings.redis_url,
        result_ex_time=settings.result_ttl_seconds,
    )

    broker = RedisStreamBroker(
        url=settings.redis_url,
        queue_name="viewport_tasks",
        consumer_group_name="viewport_workers",
    ).with_result_backend(result_backend)

# Only create scheduler for production (not needed for InMemoryBroker)
if env != "pytest":
    scheduler = TaskiqScheduler(
        broker=broker,
        sources=[LabelScheduleSource(broker)],
    )


APP_MODULE = "viewport.main:app"

taskiq_fastapi.init(broker, APP_MODULE)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def on_worker_startup(state: Any) -> None:
    logger.info("Taskiq worker startup: initializing shared resources")
    state.session_maker = get_session_maker()
    state.s3_client = AsyncS3Client()
    state.s3_bucket = get_s3_settings().bucket


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def on_worker_shutdown(state: Any) -> None:
    logger.info("Taskiq worker shutdown: releasing shared resources")
    s3_client = getattr(state, "s3_client", None)
    close = getattr(s3_client, "close", None)
    if callable(close):
        try:
            await close()
        except Exception:
            logger.exception("Failed to close sync S3 client on worker shutdown")


from viewport.tasks import maintenance_tasks, photo_tasks  # noqa: E402,F401

__all__ = ["broker", "scheduler", "result_backend", "TaskiqSettings"]
