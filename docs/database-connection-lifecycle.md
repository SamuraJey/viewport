# Database connection lifecycle

Viewport uses SQLAlchemy `AsyncSession` dependencies for HTTP requests and a
separate synchronous pool for Celery workers.

## Request dependency scope

All HTTP dependencies that consume `get_db()` must declare
`Depends(get_db, scope="function")`.

FastAPI closes a function-scoped yield dependency after the path operation has
produced its response object but before the response is sent. This distinction
matters for `StreamingResponse`: a default request-scoped dependency remains
alive until the complete response body has been streamed to the client.

ZIP streaming code must finish all database work before returning the response.
Generators used by the response may retain plain values such as S3 object keys
and archive filenames, but must not query through or otherwise depend on an
`AsyncSession`.

Do not manually close repository sessions. The FastAPI dependency owns session
cleanup, and dependencies within one request share the cached `get_db()` value.

## Session lifetime versus connection checkout

An `AsyncSession` can remain alive without holding a database connection.
SQLAlchemy checks out a connection when database work begins and returns it to
the pool when the transaction commits or rolls back. `BaseRepository._finish_read()`
ends read-only transactions promptly, and write methods commit their changes.

For this reason, a long request-session duration is not evidence of a long
connection checkout. Viewport exposes pool-level metrics based on SQLAlchemy's
`checkout` and `checkin` events:

- `viewport_db_connections_checked_out{pool="async-backend"}`
- `viewport_db_connection_checkout_duration_seconds{pool="async-backend"}`
- the same metrics with `pool="sync-worker"` inside Celery worker processes

An actual checkout lasting at least one second logs:

```text
Long-lived database connection checkout: <seconds>s (pool=<pool-name>)
```

The `get_db()` timing log is deliberately named `Long-lived request DB session`
and includes `transaction_active`. It describes dependency lifetime, not pool
ownership.

## Verification

When changing dependencies, repositories, or streaming downloads:

1. Run `pytest tests/test_db_lifecycle.py`.
2. Confirm every `get_db()` dependant remains function-scoped.
3. For streaming endpoints, confirm dependency cleanup happens before the first
   response body chunk.
4. Under load, monitor both checked-out count and checkout duration rather than
   inferring connection usage from request duration.

## References

- [FastAPI dependencies with yield and scope](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/#early-exit-and-scope)
- [FastAPI StreamingResponse dependency details](https://fastapi.tiangolo.com/advanced/advanced-dependencies/#dependencies-with-yield-and-streamingresponse-technical-details)
- [SQLAlchemy session basics](https://docs.sqlalchemy.org/en/20/orm/session_basics.html)
