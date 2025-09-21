import logging
from logging import config as logging_config


class ColoredFormatter(logging.Formatter):
    """Logging formatter that injects ANSI color codes based on levelname.

    INFO -> green, WARNING -> yellow, ERROR -> red, DEBUG -> cyan, CRITICAL -> red background.
    """

    COLOR_MAP = {
        "DEBUG": "\x1b[36m",
        "INFO": "\x1b[32m",
        "WARNING": "\x1b[33m",
        "ERROR": "\x1b[31m",
        "CRITICAL": "\x1b[41m",
    }
    RESET = "\x1b[0m"

    def __init__(self, fmt: str | None = None, datefmt: str | None = None):
        super().__init__(fmt=fmt, datefmt=datefmt)

    def format(self, record: logging.LogRecord) -> str:
        # Preserve original levelname to avoid mutating record permanently
        original_levelname = record.levelname
        color = self.COLOR_MAP.get(original_levelname, "")
        record.levelname = f"{color}{original_levelname}{self.RESET}"
        try:
            return super().format(record)
        finally:
            record.levelname = original_levelname


def configure_logging(level: str = "INFO") -> None:
    """Configure application logging to write colored logs to stdout."""

    default_fmt = "%(asctime)s %(levelname)-5s [%(name)s] %(message)s"
    access_fmt = "%(asctime)s %(levelname)-5s %(message)s"

    cfg = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {"()": "viewport.logging_config.ColoredFormatter", "format": default_fmt, "datefmt": "%Y-%m-%d %H:%M:%S"},
            "access": {"()": "viewport.logging_config.ColoredFormatter", "format": access_fmt, "datefmt": "%Y-%m-%d %H:%M:%S"},
        },
        "handlers": {
            "default": {"class": "logging.StreamHandler", "formatter": "default", "stream": "ext://sys.stdout"},
            "access": {"class": "logging.StreamHandler", "formatter": "access", "stream": "ext://sys.stdout"},
        },
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": level, "propagate": False},
            "uvicorn.error": {"handlers": ["default"], "level": level, "propagate": False},
            "uvicorn.access": {"handlers": ["access"], "level": level, "propagate": False},
        },
        "root": {"handlers": ["default"], "level": level},
    }

    logging_config.dictConfig(cfg)


__all__ = ["configure_logging", "ColoredFormatter"]
