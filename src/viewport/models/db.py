import logging
from collections.abc import AsyncGenerator
from functools import lru_cache

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all models."""

    __abstract__ = True  # Prevents this class from being created as a table


class DatabaseSettings(BaseSettings):
    """Settings for database connection, loaded from environment variables."""

    db: str
    user: str
    password: str
    host: str
    port: int = 5432

    @property
    def database_url(self) -> str:  # pragma: no cover
        return f"postgresql+psycopg://{self.user}:{self.password}@{self.host}:{self.port}/{self.db}"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", env_prefix="POSTGRES_", extra="ignore")


@lru_cache(maxsize=1)
def get_database_url() -> str:  # pragma: no cover
    settings = DatabaseSettings()
    return settings.database_url


@lru_cache(maxsize=5)
def _get_engine_and_sessionmaker() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:  # pragma: no cover
    """Create and cache the SQLAlchemy engine and sessionmaker lazily."""
    database_url = get_database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

    # Configure connection pool for high concurrency with sync SQLAlchemy + FastAPI
    # With 2 workers @ 120 RPS each, and multiple DB queries per request:
    # - Auth: 1 query per request
    # - Business logic: 1-3 queries per request
    # - Average request time: 50-100ms
    # Concurrent requests per worker: 120 RPS * 0.1s = 12 concurrent
    # But with bursts and slow queries, need 3-5x margin
    # pool_size: persistent connections (kept alive)
    # max_overflow: additional temporary connections when pool exhausted
    pool_config = {
        "pool_size": 20,  # Reduced from 100 - keep connections lean
        "max_overflow": 20,  # Reduced from 50
        "pool_timeout": 5,  # Wait up to 5 seconds (should never happen with this size)
        "pool_recycle": 1800,  # Recycle connections every 30 minutes
        "pool_pre_ping": True,  # Verify connection health before using
    }

    eng = create_async_engine(database_url, connect_args=connect_args, **pool_config)
    sess = async_sessionmaker(bind=eng, expire_on_commit=False)

    return eng, sess


@lru_cache(maxsize=5)
def _get_sync_engine_and_sessionmaker() -> tuple[Engine, sessionmaker[Session]]:  # pragma: no cover
    """Create sync engine/sessionmaker for Celery workers running outside the event loop."""
    database_url = get_database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

    pool_config = {
        "pool_size": 20,
        "max_overflow": 20,
        "pool_timeout": 5,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    }

    eng = create_engine(database_url, future=True, connect_args=connect_args, **pool_config)
    sess = sessionmaker(bind=eng, future=True)

    return eng, sess


def get_engine():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[0]


def get_session_maker():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[1]


def get_sync_engine():  # pragma: no cover - simple accessor
    return _get_sync_engine_and_sessionmaker()[0]


def get_sync_session_maker():  # pragma: no cover - simple accessor
    return _get_sync_engine_and_sessionmaker()[1]


async def get_db() -> AsyncGenerator[AsyncSession]:  # pragma: no cover
    """Dependency injection for database sessions.

    The context manager automatically closes the session,
    so explicit close() is not needed and can cause issues.
    """
    import time

    session_maker = get_session_maker()
    session_start = time.time()

    async with session_maker() as session:
        try:
            yield session
        except HTTPException as http_exc:
            status_code = getattr(http_exc, "status_code", None)
            log_method = logger.info if isinstance(status_code, int) and status_code < 500 else logger.warning
            log_method("Session HTTP exception after %.3fs: %s", time.time() - session_start, http_exc)
            await session.rollback()
            raise
        except RequestValidationError as validation_exc:
            # Invalid request payloads (422) are expected user errors, not server crashes.
            logger.info("Session validation exception after %.3fs: %s", time.time() - session_start, validation_exc)
            await session.rollback()
            raise
        except Exception as e:
            logger.warning("Session error after %.3fs: %s", time.time() - session_start, e, exc_info=True)
            await session.rollback()
            raise
        finally:
            duration = time.time() - session_start
            if duration > 1.0:  # Log sessions longer than 1 second
                logger.warning("Long-lived session: %.3fs", duration)
