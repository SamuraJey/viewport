from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from viewport.telemetry_safety import redact_mapping


class StructuredLogger:
    """Structured event wrapper over the standard logging system.

    In JSON logging mode the formatter merges ``structured_fields`` into the
    top-level log object. In local colored mode the event still appears as a
    readable message while preserving structured extras for test/log adapters.
    """

    def __init__(self, name: str = "viewport"):
        self._logger = logging.getLogger(name)

    def log_event(self, event: str, **kwargs: Any) -> None:
        """Emit a privacy-safe structured event."""

        payload: dict[str, Any] = {
            "event": event,
            "event_timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }

        for key, value in kwargs.items():
            if key == "extra" and isinstance(value, dict):
                payload.update(value)
            else:
                payload[key] = value

        safe_payload = redact_mapping(payload)
        self._logger.info(event, extra={"structured_fields": safe_payload})

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._logger.info(msg, *args, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._logger.warning(msg, *args, **kwargs)

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._logger.error(msg, *args, **kwargs)


logger = StructuredLogger()

__all__ = ["logger", "StructuredLogger"]
