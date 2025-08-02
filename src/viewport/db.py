from collections.abc import Generator

from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
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
    def database_url(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.db}"

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8", env_prefix="POSTGRES_", extra="ignore")


def get_database_url() -> str:
    """Retrieve the database URL from environment variables or settings."""
    settings = DatabaseSettings()
    return settings.database_url


DATABASE_URL = get_database_url()
if "sqlite" in DATABASE_URL:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, future=True)
else:
    engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, future=True)


def get_db() -> Generator[Session]:
    with SessionLocal() as db:
        try:
            yield db
        finally:
            db.close()
