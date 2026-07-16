from unittest.mock import Mock

from viewport.models import db


def test_sync_engine_uses_worker_sized_connection_pool(monkeypatch):
    db._get_sync_engine_and_sessionmaker.cache_clear()
    engine = Mock()
    create_engine = Mock(return_value=engine)
    session_factory = Mock()

    monkeypatch.setattr(db, "get_database_url", lambda: "postgresql+psycopg://viewport:test@db/viewport")
    monkeypatch.setattr(db, "create_engine", create_engine)
    monkeypatch.setattr(db, "sessionmaker", Mock(return_value=session_factory))

    created_engine, created_session_factory = db._get_sync_engine_and_sessionmaker()

    assert created_engine is engine
    assert created_session_factory is session_factory
    create_engine.assert_called_once_with(
        "postgresql+psycopg://viewport:test@db/viewport",
        future=True,
        connect_args={},
        pool_size=2,
        max_overflow=2,
        pool_timeout=5,
        pool_recycle=1800,
        pool_pre_ping=True,
    )

    db._get_sync_engine_and_sessionmaker.cache_clear()
