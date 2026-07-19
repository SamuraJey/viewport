import asyncio
import logging

import pytest
from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute, Dependant
from sqlalchemy import create_engine, text

from viewport.api.auth import router as auth_router
from viewport.api.gallery import router as gallery_router
from viewport.api.photo import router as photo_router
from viewport.api.project import router as project_router
from viewport.api.public import router as public_router
from viewport.api.selection import router as selection_router
from viewport.api.sharelink import router as sharelink_router
from viewport.api.user import router as user_router
from viewport.db_metrics import DB_CONNECTION_CHECKOUT_DURATION_SECONDS, DB_CONNECTIONS_CHECKED_OUT, instrument_connection_pool
from viewport.models.db import get_db

ROUTERS = (
    auth_router,
    gallery_router,
    photo_router,
    project_router,
    sharelink_router,
    public_router,
    selection_router,
    user_router,
)


def _walk_dependencies(dependant: Dependant):
    yield dependant
    for dependency in dependant.dependencies:
        yield from _walk_dependencies(dependency)


def _sample_value(metric, sample_name: str, labels: dict[str, str]) -> float:
    for collected_metric in metric.collect():
        for sample in collected_metric.samples:
            if sample.name == sample_name and sample.labels == labels:
                return float(sample.value)
    return 0.0


def test_all_request_db_dependencies_are_function_scoped():
    violations: list[str] = []

    for router in ROUTERS:
        for route in router.routes:
            if not isinstance(route, APIRoute):
                continue
            violations.extend(
                f"{','.join(sorted(route.methods or []))} {route.path}: scope={dependency.scope!r}"
                for dependency in _walk_dependencies(route.dependant)
                if dependency.call is get_db and dependency.scope != "function"
            )

    assert violations == []


@pytest.mark.asyncio
async def test_function_scoped_dependency_closes_before_streaming_starts():
    events: list[str] = []
    stream_app = FastAPI()

    async def resource():
        events.append("resource-enter")
        try:
            yield object()
        finally:
            events.append("resource-exit")

    async def chunks():
        events.append("stream-start")
        yield b"chunk"
        events.append("stream-end")

    @stream_app.get("/")
    async def stream_route(_resource=Depends(resource, scope="function")):
        events.append("handler-return")
        return StreamingResponse(chunks())

    receive_forever = asyncio.Event()
    sent_messages: list[dict] = []

    async def receive():
        await receive_forever.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict):
        sent_messages.append(message)

    await stream_app(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 80),
        },
        receive,
        send,
    )

    assert events == ["resource-enter", "handler-return", "resource-exit", "stream-start", "stream-end"]
    assert any(message["type"] == "http.response.body" and message.get("body") == b"chunk" for message in sent_messages)


def test_connection_pool_instrumentation_tracks_real_checkout_duration(caplog):
    pool_name = "test-lifecycle"
    labels = {"pool": pool_name}
    checked_out_before = _sample_value(DB_CONNECTIONS_CHECKED_OUT, "viewport_db_connections_checked_out", labels)
    duration_count_before = _sample_value(DB_CONNECTION_CHECKOUT_DURATION_SECONDS, "viewport_db_connection_checkout_duration_seconds_count", labels)
    engine = create_engine("sqlite://")
    instrument_connection_pool(engine, pool_name=pool_name, long_checkout_seconds=0.0)

    with caplog.at_level(logging.WARNING, logger="viewport.db_metrics"), engine.connect() as connection:
        assert _sample_value(DB_CONNECTIONS_CHECKED_OUT, "viewport_db_connections_checked_out", labels) == checked_out_before + 1
        connection.execute(text("SELECT 1"))

    assert _sample_value(DB_CONNECTIONS_CHECKED_OUT, "viewport_db_connections_checked_out", labels) == checked_out_before
    assert _sample_value(DB_CONNECTION_CHECKOUT_DURATION_SECONDS, "viewport_db_connection_checkout_duration_seconds_count", labels) == duration_count_before + 1
    assert "Long-lived database connection checkout" in caplog.text
    engine.dispose()
