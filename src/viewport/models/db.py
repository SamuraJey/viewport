import logging
from collections.abc import Generator
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine
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
def _get_engine_and_sessionmaker() -> tuple[Engine, sessionmaker[Session]]:  # pragma: no cover
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
        "pool_size": 100,  # Large base pool for high concurrency (per worker)
        "max_overflow": 50,  # Allow up to 150 total connections per worker during bursts (100 base + 50 overflow)
        "pool_timeout": 20,  # Wait up to 20 seconds (should never happen with this size)
        "pool_recycle": 1800,  # Recycle connections every 30 minutes
        "pool_pre_ping": True,  # Verify connection health before using
    }

    eng = create_engine(database_url, future=True, connect_args=connect_args, **pool_config)
    sess = sessionmaker(bind=eng, future=True)

    return eng, sess


def get_engine():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[0]


def get_session_maker():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[1]


def get_db() -> Generator[Session]:  # pragma: no cover
    """Dependency injection for database sessions.

    The context manager automatically closes the session,
    so explicit close() is not needed and can cause issues.
    """
    import time

    session_maker = get_session_maker()
    session = session_maker()
    session_start = time.time()

    try:
        yield session
    except Exception as e:
        logger.warning("Session error after %.3fs: %s", time.time() - session_start, e)
        session.rollback()
        raise
    finally:
        duration = time.time() - session_start
        if duration > 1.0:  # Log sessions longer than 1 second
            logger.warning("Long-lived session: %.3fs", duration)
        session.close()
