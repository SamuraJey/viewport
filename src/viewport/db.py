from collections.abc import Generator
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


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
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.db}"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", env_prefix="POSTGRES_", extra="ignore")


def get_database_url() -> str:
    settings = DatabaseSettings()
    return settings.database_url


@lru_cache(maxsize=1)
def _get_engine_and_sessionmaker() -> tuple[Engine, sessionmaker[Session]]:  # pragma: no cover
    """Create and cache the SQLAlchemy engine and sessionmaker lazily."""
    database_url = get_database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    eng = create_engine(database_url, future=True, connect_args=connect_args)
    sess = sessionmaker(bind=eng, future=True)

    return eng, sess


def get_engine():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[0]


def get_session_maker():  # pragma: no cover - simple accessor
    return _get_engine_and_sessionmaker()[1]


def get_db() -> Generator[Session]:  # pragma: no cover
    session_maker = get_session_maker()
    with session_maker() as db:
        try:
            yield db
        finally:
            db.close()
