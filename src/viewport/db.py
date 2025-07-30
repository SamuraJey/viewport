import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Base class for all models."""

    __abstract__ = True  # Prevents this class from being created as a table


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://viewport:viewport@localhost:5432/viewport")
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
