import asyncio
import logging
import re
from collections import defaultdict, deque
from time import monotonic

from taskiq import TaskiqMiddleware
from taskiq.message import TaskiqMessage

logger = logging.getLogger(__name__)

RATE_LIMIT_PATTERN = re.compile(r"^\s*(\d+)\s*/\s*([smh])\s*$")
RATE_LIMIT_INTERVALS_SECONDS = {
    "s": 1.0,
    "m": 60.0,
    "h": 3600.0,
}


def parse_rate_limit(rate_limit: str) -> tuple[int, float]:
    match = RATE_LIMIT_PATTERN.match(rate_limit)
    if match is None:
        raise ValueError(f"Unsupported rate limit format: {rate_limit}")

    max_calls = int(match.group(1))
    if max_calls <= 0:
        raise ValueError(f"Rate limit must be positive: {rate_limit}")

    interval_seconds = RATE_LIMIT_INTERVALS_SECONDS[match.group(2)]
    return max_calls, interval_seconds


class TaskRateLimitMiddleware(TaskiqMiddleware):
    def __init__(self) -> None:
        self._executions: dict[str, deque[float]] = defaultdict(deque)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def _now(self) -> float:
        return monotonic()

    async def _sleep(self, delay_seconds: float) -> None:
        await asyncio.sleep(delay_seconds)

    async def pre_execute(self, message: TaskiqMessage) -> TaskiqMessage:
        rate_limit = message.labels.get("rate_limit")
        if not rate_limit:
            return message

        try:
            max_calls, interval_seconds = parse_rate_limit(str(rate_limit))
        except ValueError:
            logger.warning("Ignoring invalid Taskiq rate limit %r for task %s", rate_limit, message.task_name)
            return message

        async with self._locks[message.task_name]:
            executions = self._executions[message.task_name]

            while True:
                now = self._now()
                cutoff = now - interval_seconds
                while executions and executions[0] <= cutoff:
                    executions.popleft()

                if len(executions) < max_calls:
                    executions.append(now)
                    return message

                delay_seconds = max(executions[0] + interval_seconds - now, 0.0)
                logger.debug(
                    "Rate limiting task %s for %.3fs due to %s",
                    message.task_name,
                    delay_seconds,
                    rate_limit,
                )
                await self._sleep(delay_seconds)
