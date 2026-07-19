from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

from viewport.models import db


def _mock_db_session(monkeypatch, *, transaction_active: bool = False):
    session = MagicMock()
    session.rollback = AsyncMock()
    session.in_transaction.return_value = transaction_active
    session_context = MagicMock()
    session_context.__aenter__ = AsyncMock(return_value=session)
    session_context.__aexit__ = AsyncMock(return_value=None)
    session_maker = Mock(return_value=session_context)
    monkeypatch.setattr(db, "get_session_maker", Mock(return_value=session_maker))
    return session


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "log_method"),
    [(404, "info"), (500, "warning")],
)
async def test_get_db_rolls_back_and_logs_http_exceptions(monkeypatch, status_code, log_method):
    session = _mock_db_session(monkeypatch)
    error = HTTPException(status_code=status_code, detail="failed")
    events: list[str] = []
    session.rollback.side_effect = lambda: events.append("rollback")

    with (
        patch.object(db.time, "monotonic", side_effect=[0.0, 0.25, 0.5]),
        patch.object(db.logger, log_method) as log,
    ):
        dependency = db.get_db()
        assert await anext(dependency) is session
        with pytest.raises(HTTPException) as raised:
            await dependency.athrow(error)
        events.append("raised")

    assert raised.value is error
    assert events == ["rollback", "raised"]
    session.rollback.assert_awaited_once_with()
    log.assert_called_once_with("Session HTTP exception after %.3fs: %s", 0.25, error)


@pytest.mark.asyncio
async def test_get_db_rolls_back_and_logs_validation_exceptions(monkeypatch):
    session = _mock_db_session(monkeypatch)
    error = RequestValidationError([])
    events: list[str] = []
    session.rollback.side_effect = lambda: events.append("rollback")

    with (
        patch.object(db.time, "monotonic", side_effect=[0.0, 0.25, 0.5]),
        patch.object(db.logger, "info") as log,
    ):
        dependency = db.get_db()
        assert await anext(dependency) is session
        with pytest.raises(RequestValidationError) as raised:
            await dependency.athrow(error)
        events.append("raised")

    assert raised.value is error
    assert events == ["rollback", "raised"]
    session.rollback.assert_awaited_once_with()
    log.assert_called_once_with("Session validation exception after %.3fs: %s", 0.25, error)


@pytest.mark.asyncio
async def test_get_db_rolls_back_and_logs_unexpected_exceptions(monkeypatch):
    session = _mock_db_session(monkeypatch)
    error = RuntimeError("failed")
    events: list[str] = []
    session.rollback.side_effect = lambda: events.append("rollback")

    with (
        patch.object(db.time, "monotonic", side_effect=[0.0, 0.25, 0.5]),
        patch.object(db.logger, "warning") as log,
    ):
        dependency = db.get_db()
        assert await anext(dependency) is session
        with pytest.raises(RuntimeError) as raised:
            await dependency.athrow(error)
        events.append("raised")

    assert raised.value is error
    assert events == ["rollback", "raised"]
    session.rollback.assert_awaited_once_with()
    log.assert_called_once_with("Session error after %.3fs: %s", 0.25, error, exc_info=True)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("transaction_active", "log_method"),
    [(False, "info"), (True, "warning")],
)
async def test_get_db_logs_long_lived_sessions_by_transaction_state(monkeypatch, transaction_active, log_method):
    session = _mock_db_session(monkeypatch, transaction_active=transaction_active)

    with (
        patch.object(db.time, "monotonic", side_effect=[0.0, 1.25]),
        patch.object(db.logger, log_method) as log,
    ):
        dependency = db.get_db()
        assert await anext(dependency) is session
        await dependency.aclose()

    session.rollback.assert_not_awaited()
    log.assert_called_once_with(
        "Long-lived request DB session: %.3fs (transaction_active=%s)",
        1.25,
        transaction_active,
    )


def test_sync_engine_uses_worker_sized_connection_pool(monkeypatch):
    db._get_sync_engine_and_sessionmaker.cache_clear()
    try:
        engine = Mock()
        create_engine = Mock(return_value=engine)
        session_factory = Mock()
        instrument_connection_pool = Mock()

        monkeypatch.setattr(db, "get_database_url", lambda: "postgresql+psycopg://viewport:test@db/viewport")
        monkeypatch.setattr(db, "create_engine", create_engine)
        monkeypatch.setattr(db, "sessionmaker", Mock(return_value=session_factory))
        monkeypatch.setattr(db, "instrument_connection_pool", instrument_connection_pool)

        created_engine, created_session_factory = db._get_sync_engine_and_sessionmaker()

        assert created_engine is engine
        assert created_session_factory is session_factory
        instrument_connection_pool.assert_called_once_with(engine, pool_name="sync-worker")
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
    finally:
        db._get_sync_engine_and_sessionmaker.cache_clear()
