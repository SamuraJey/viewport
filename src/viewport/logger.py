import json
import logging
from datetime import UTC, datetime


class StructuredLogger:
    """A small wrapper that emits structured JSON events via the standard
    logging system. The JSON is written as the message so it flows through the
    configured handlers (stdout) and formatters.
    """

    def __init__(self, name: str = "viewport"):
        self._logger = logging.getLogger(name)

    def log_event(self, event: str, **kwargs) -> None:
        """Emit a structured event. Common usage:

        logger.log_event("view_photo", share_id=..., extra={...})
        """
        payload = {"timestamp": datetime.now(UTC).isoformat() + "Z", "event": event}

        # Merge kwargs into payload. If `extra` is provided and is a dict,
        # merge its keys at top-level to match existing expectations.
        for k, v in kwargs.items():
            if k == "extra" and isinstance(v, dict):
                payload.update(v)
            else:
                payload[k] = v

        try:
            self._logger.info(json.dumps(payload, default=str))
        except Exception:
            # Fallback to plain log if JSON serialization fails
            self._logger.info("%s %s", event, kwargs)

    # Proxy common logging methods to the underlying logger for convenience
    def info(self, msg: str, *args, **kwargs):
        return self._logger.info(msg, *args, **kwargs)

    def warning(self, msg: str, *args, **kwargs):
        return self._logger.warning(msg, *args, **kwargs)

    def error(self, msg: str, *args, **kwargs):
        return self._logger.error(msg, *args, **kwargs)


# Export a single logger instance used by the project and tests
logger = StructuredLogger()

__all__ = ["logger", "StructuredLogger"]
