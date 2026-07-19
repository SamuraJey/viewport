import logging
import time

from prometheus_client import Gauge, Histogram
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.pool import ConnectionPoolEntry, PoolProxiedConnection

logger = logging.getLogger(__name__)

LONG_CONNECTION_CHECKOUT_SECONDS = 1.0

DB_CONNECTIONS_CHECKED_OUT = Gauge(
    "viewport_db_connections_checked_out",
    "Database connections currently checked out from a SQLAlchemy pool.",
    labelnames=("pool",),
)

DB_CONNECTION_CHECKOUT_DURATION_SECONDS = Histogram(
    "viewport_db_connection_checkout_duration_seconds",
    "Time a database connection remains checked out from a SQLAlchemy pool.",
    labelnames=("pool",),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 15.0, 30.0, 60.0, 120.0, float("inf")),
)


def instrument_connection_pool(
    engine: Engine | AsyncEngine,
    *,
    pool_name: str,
    long_checkout_seconds: float = LONG_CONNECTION_CHECKOUT_SECONDS,
) -> None:
    """Record actual connection checkout durations for one SQLAlchemy pool."""
    sync_engine = engine.sync_engine if isinstance(engine, AsyncEngine) else engine
    pool = sync_engine.pool
    checkout_started_key = f"viewport_checkout_started:{pool_name}"
    checked_out = DB_CONNECTIONS_CHECKED_OUT.labels(pool=pool_name)
    checkout_duration = DB_CONNECTION_CHECKOUT_DURATION_SECONDS.labels(pool=pool_name)

    def on_checkout(
        _dbapi_connection: DBAPIConnection,
        connection_record: ConnectionPoolEntry,
        _connection_proxy: PoolProxiedConnection,
    ) -> None:
        connection_record.info[checkout_started_key] = time.monotonic()
        checked_out.inc()

    def on_checkin(_dbapi_connection: DBAPIConnection | None, connection_record: ConnectionPoolEntry) -> None:
        checkout_started = connection_record.info.pop(checkout_started_key, None)
        if checkout_started is None:
            return

        duration = time.monotonic() - checkout_started
        checked_out.dec()
        checkout_duration.observe(duration)
        if duration >= long_checkout_seconds:
            logger.warning(
                "Long-lived database connection checkout: %.3fs (pool=%s)",
                duration,
                pool_name,
            )

    event.listen(pool, "checkout", on_checkout)
    event.listen(pool, "checkin", on_checkin)
