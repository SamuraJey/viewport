import asyncio
import logging
import os
import re
import time
import uuid
from collections.abc import AsyncGenerator, Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
import jwt
import pytest
import pytest_asyncio
from botocore.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.core.container import DockerContainer
from testcontainers.postgres import PostgresContainer

POSTGRES_IMAGE = "postgres:17-alpine"

S3_IMAGE = "rustfs/rustfs:1.0.0-alpha.85"
S3_ROOT_ACCESS_KEY = "testaccesskey"
S3_ROOT_SECRET_KEY = "testsecretkey"
S3_PORT = 9000
VALKEY_IMAGE = "valkey/valkey:8-alpine"
VALKEY_PORT = 6379
S3_TRIGGER_FIXTURES = {
    "s3_container",
    "client",
    "authenticated_client",
    "auth_token",
    "gallery_fixture",
    "sharelink_fixture",
    "gallery_id_fixture",
    "sharelink_data",
}

logger = logging.getLogger(__name__)

_SHARED_POSTGRES_CONTAINER: PostgresContainer | None = None
_SHARED_POSTGRES_INFO: dict[str, Any] | None = None
_SHARED_S3_CONTAINER: DockerContainer | None = None
_SHARED_S3_INFO: dict[str, Any] | None = None
_SHARED_VALKEY_CONTAINER: DockerContainer | None = None
_SHARED_VALKEY_INFO: dict[str, Any] | None = None

os.environ.update(
    {
        "JWT_SECRET_KEY": "supersecretkeysupersecretkeysupersecretkey",
        "ADMIN_JWT_SECRET_KEY": "adminsecretkeyadminsecretkeyadminsecretkey",
        "INVITE_CODE": "testinvitecode",
        "ENVIRONMENT": "pytest",
    }
)


@dataclass(frozen=True)
class PostgresConnectionInfo:
    username: str
    password: str
    host: str
    port: int
    database: str

    def get_connection_url(self, driver: str | None = None, database: str | None = None) -> str:
        driver_name = "postgresql"
        if driver:
            driver_name = f"{driver_name}+{driver}"

        target_db = database or self.database
        return f"{driver_name}://{self.username}:{self.password}@{self.host}:{self.port}/{target_db}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "password": self.password,
            "host": self.host,
            "port": self.port,
            "database": self.database,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "PostgresConnectionInfo":
        return cls(
            username=str(data["username"]),
            password=str(data["password"]),
            host=str(data["host"]),
            port=int(data["port"]),
            database=str(data["database"]),
        )


@dataclass(frozen=True)
class S3ConnectionInfo:
    host: str
    port: int

    @property
    def endpoint_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "S3ConnectionInfo":
        return cls(
            host=str(data["host"]),
            port=int(data["port"]),
        )


@dataclass(frozen=True)
class ValkeyConnectionInfo:
    host: str
    port: int

    def redis_url(self, db_index: int) -> str:
        return f"redis://{self.host}:{self.port}/{db_index}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ValkeyConnectionInfo":
        return cls(
            host=str(data["host"]),
            port=int(data["port"]),
        )


def _xdist_enabled(config: pytest.Config) -> bool:
    num_processes = getattr(config.option, "numprocesses", 0)
    if num_processes in (0, 1, None):
        return False
    return bool(num_processes)


def _is_worker_process(config: pytest.Config) -> bool:
    return hasattr(config, "workerinput")


def _sanitize_worker_id(worker_id: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9_]", "_", worker_id)
    if not sanitized:
        sanitized = "worker"
    return sanitized[:64]


def _worker_id_from_config(config: pytest.Config) -> str:
    if _is_worker_process(config):
        worker_id = str(config.workerinput.get("workerid", "gw0"))
    else:
        worker_id = os.environ.get("PYTEST_XDIST_WORKER", "master")
    return _sanitize_worker_id(worker_id)


def _connection_info_from_container(container: PostgresContainer) -> PostgresConnectionInfo:
    db_url = container.get_connection_url(driver="psycopg")
    url = make_url(db_url)
    return PostgresConnectionInfo(
        username=url.username or "",
        password=url.password or "",
        host=url.host or "",
        port=int(url.port or 5432),
        database=url.database or "postgres",
    )


def _connection_info_from_s3_container(container: DockerContainer) -> S3ConnectionInfo:
    return S3ConnectionInfo(
        host=container.get_container_host_ip(),
        port=int(container.get_exposed_port(S3_PORT)),
    )


def _connection_info_from_valkey_container(container: DockerContainer) -> ValkeyConnectionInfo:
    return ValkeyConnectionInfo(
        host=container.get_container_host_ip(),
        port=int(container.get_exposed_port(VALKEY_PORT)),
    )


def _build_s3_env(endpoint_url: str, bucket_name: str) -> dict[str, str]:
    return {
        "S3_ENDPOINT": endpoint_url,
        "S3_ACCESS_KEY": S3_ROOT_ACCESS_KEY,
        "S3_SECRET_KEY": S3_ROOT_SECRET_KEY,
        "S3_BUCKET": bucket_name,
        "S3_REGION": "us-east-1",
        "S3_USE_SSL": "false",
        "S3_SIGNATURE_VERSION": "s3v4",
    }


def _start_s3_container() -> DockerContainer:
    container = DockerContainer(S3_IMAGE).with_env("RUSTFS_ACCESS_KEY", S3_ROOT_ACCESS_KEY).with_env("RUSTFS_SECRET_KEY", S3_ROOT_SECRET_KEY).with_exposed_ports(S3_PORT)
    container.start()
    return container


def _start_valkey_container() -> DockerContainer:
    container = DockerContainer(VALKEY_IMAGE).with_exposed_ports(VALKEY_PORT)
    container.start()
    return container


def _worker_redis_db_index(config: pytest.Config) -> int:
    worker_id = _worker_id_from_config(config)
    if worker_id == "master":
        return 0

    match = re.search(r"(\d+)$", worker_id)
    worker_num = int(match.group(1)) if match else 0
    return (worker_num % 15) + 1


def pytest_configure(config: pytest.Config) -> None:
    global _SHARED_POSTGRES_CONTAINER, _SHARED_POSTGRES_INFO, _SHARED_S3_CONTAINER, _SHARED_S3_INFO, _SHARED_VALKEY_CONTAINER, _SHARED_VALKEY_INFO

    if _is_worker_process(config) or not _xdist_enabled(config):
        return

    if _SHARED_POSTGRES_CONTAINER is None:
        try:
            container = PostgresContainer(image=POSTGRES_IMAGE)
            container.start()
            _SHARED_POSTGRES_CONTAINER = container
            _SHARED_POSTGRES_INFO = _connection_info_from_container(container).to_dict()
        except Exception:
            pass  # Docker not available, skip shared container

    if _SHARED_S3_CONTAINER is None:
        try:
            s3_container = _start_s3_container()
            _SHARED_S3_CONTAINER = s3_container
            _SHARED_S3_INFO = _connection_info_from_s3_container(s3_container).to_dict()
        except Exception:
            pass  # Docker not available, skip shared container

    if _SHARED_VALKEY_CONTAINER is None:
        try:
            valkey_container = _start_valkey_container()
            _SHARED_VALKEY_CONTAINER = valkey_container
            _SHARED_VALKEY_INFO = _connection_info_from_valkey_container(valkey_container).to_dict()
        except Exception:
            pass  # Docker not available, skip shared container


def pytest_configure_node(node) -> None:
    if _SHARED_POSTGRES_INFO is not None:
        node.workerinput["shared_postgres"] = _SHARED_POSTGRES_INFO
    if _SHARED_S3_INFO is not None:
        node.workerinput["shared_s3"] = _SHARED_S3_INFO
    if _SHARED_VALKEY_INFO is not None:
        node.workerinput["shared_valkey"] = _SHARED_VALKEY_INFO


def pytest_unconfigure(config: pytest.Config) -> None:
    global _SHARED_POSTGRES_CONTAINER, _SHARED_POSTGRES_INFO, _SHARED_S3_CONTAINER, _SHARED_S3_INFO, _SHARED_VALKEY_CONTAINER, _SHARED_VALKEY_INFO

    if _is_worker_process(config):
        return

    if _SHARED_POSTGRES_CONTAINER is None:
        pass
    else:
        _SHARED_POSTGRES_CONTAINER.stop()
        _SHARED_POSTGRES_CONTAINER = None
        _SHARED_POSTGRES_INFO = None

    if _SHARED_S3_CONTAINER is not None:
        _SHARED_S3_CONTAINER.stop()
        _SHARED_S3_CONTAINER = None
        _SHARED_S3_INFO = None

    if _SHARED_VALKEY_CONTAINER is not None:
        _SHARED_VALKEY_CONTAINER.stop()
        _SHARED_VALKEY_CONTAINER = None
        _SHARED_VALKEY_INFO = None


@contextmanager
def _temporary_env_vars(overrides: Mapping[str, str]):
    """Temporarily override selected environment variables.

    This context manager:
    - Records the original value (or lack of a value) for each key in ``overrides``.
    - Sets ``os.environ`` to use the provided override values for the duration of the
      ``with`` block.
    - Restores each variable to its original value on exit, or removes it entirely if
      it did not exist before the context was entered.
    """
    previous = {key: os.environ.get(key) for key in overrides}
    os.environ.update(overrides)
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _make_s3_config(signature: str) -> Config:
    return Config(
        s3={"addressing_style": "path"},
        signature_version=signature,
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )


def _create_s3_client(endpoint_url: str, signature: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=S3_ROOT_ACCESS_KEY,
        aws_secret_access_key=S3_ROOT_SECRET_KEY,
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=_make_s3_config(signature),
    )


def _ensure_s3_bucket(endpoint_url: str, bucket_name: str, signature: str, attempts: int = 60, delay: float = 0.1) -> bool:
    for _ in range(attempts):
        try:
            client = _create_s3_client(endpoint_url, signature)
        except Exception as exc:
            logger.warning("Unable to build S3 client (sig=%s): %s", signature, exc)
            time.sleep(delay)
            continue

        try:
            client.create_bucket(Bucket=bucket_name)
            return True
        except client.exceptions.BucketAlreadyOwnedByYou:
            return True
        except client.exceptions.BucketAlreadyExists:
            return True
        except Exception as exc:  # noqa: BLE001 - catch unexpected S3 API errors during bucket creation and keep retry loop running
            logger.warning("Error creating S3 bucket via API (sig=%s): %s", signature, exc)
            time.sleep(delay)
    return False


def _clear_s3_cache() -> None:
    try:
        from viewport.s3_utils import get_s3_client, get_s3_settings

        get_s3_settings.cache_clear()
        get_s3_client.cache_clear()
    except ImportError:
        pass


def _refresh_app_s3_client_instance() -> None:
    try:
        from viewport.dependencies import set_s3_client_instance
        from viewport.s3_service import AsyncS3Client

        set_s3_client_instance(AsyncS3Client())
    except ImportError:
        pass


def _needs_s3_for_request(request: pytest.FixtureRequest) -> bool:
    return bool(S3_TRIGGER_FIXTURES.intersection(request.fixturenames))


@pytest.fixture(scope="session")
def _postgres_server(request: pytest.FixtureRequest) -> Generator[PostgresConnectionInfo]:
    """Provide PostgreSQL server connection info.

    Under xdist this reuses one server started by master process.
    Without xdist it starts a regular testcontainer for the session.
    """
    worker_input = getattr(request.config, "workerinput", {})
    shared_info = worker_input.get("shared_postgres")

    if shared_info:
        yield PostgresConnectionInfo.from_dict(shared_info)
        return

    with PostgresContainer(image=POSTGRES_IMAGE) as container:
        yield _connection_info_from_container(container)


@pytest.fixture(scope="session")
def postgres_container(_postgres_server: PostgresConnectionInfo, request: pytest.FixtureRequest) -> Generator[PostgresConnectionInfo]:
    """Per-worker isolated database on top of a PostgreSQL testcontainer server."""
    worker_id = _worker_id_from_config(request.config).replace("-", "_")
    worker_db_name = f"test_{worker_id}"

    admin_url = _postgres_server.get_connection_url(driver="psycopg", database="postgres")
    admin_engine = create_engine(admin_url)
    try:
        with admin_engine.connect() as connection:
            connection = connection.execution_options(isolation_level="AUTOCOMMIT")
            connection.execute(text(f'DROP DATABASE IF EXISTS "{worker_db_name}" WITH (FORCE)'))
            connection.execute(text(f'CREATE DATABASE "{worker_db_name}"'))
    finally:
        admin_engine.dispose()

    env_updates = {
        "POSTGRES_DB": worker_db_name,
        "POSTGRES_USER": _postgres_server.username,
        "POSTGRES_PASSWORD": _postgres_server.password,
        "POSTGRES_HOST": _postgres_server.host,
        "POSTGRES_PORT": str(_postgres_server.port),
    }

    worker_connection = PostgresConnectionInfo(
        username=_postgres_server.username,
        password=_postgres_server.password,
        host=_postgres_server.host,
        port=_postgres_server.port,
        database=worker_db_name,
    )

    with _temporary_env_vars(env_updates):
        # Clear the database connection caches after environment is set up
        # This ensures tasks get the correct test database connection
        from viewport.models.db import _get_engine_and_sessionmaker, _get_sync_engine_and_sessionmaker, get_database_url

        get_database_url.cache_clear()
        _get_engine_and_sessionmaker.cache_clear()
        _get_sync_engine_and_sessionmaker.cache_clear()

        try:
            yield worker_connection
        finally:
            cleanup_engine = create_engine(admin_url)
            try:
                with cleanup_engine.connect() as connection:
                    connection = connection.execution_options(isolation_level="AUTOCOMMIT")
                    connection.execute(text(f'DROP DATABASE IF EXISTS "{worker_db_name}" WITH (FORCE)'))
            finally:
                cleanup_engine.dispose()


@pytest.fixture(scope="session")
def async_engine(postgres_container: PostgresConnectionInfo) -> Generator[AsyncEngine]:
    """Фикстура движка SQLAlchemy с областью видимости на сессию."""

    from viewport.models import Gallery, Photo, ShareLink, User  # noqa: F401
    from viewport.models.db import Base

    db_url = postgres_container.get_connection_url(driver="psycopg")
    engine = create_async_engine(db_url)

    async def _create_all() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create_all())
    yield engine

    async def _drop_all() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    asyncio.run(_drop_all())


@pytest.fixture(scope="session")
def engine(async_engine: AsyncEngine) -> Generator[AsyncEngine]:
    yield async_engine


@pytest.fixture(scope="session")
def sync_engine(postgres_container: PostgresConnectionInfo) -> Generator[Engine]:
    """Sync engine for Celery task tests against the same test database."""
    db_url = postgres_container.get_connection_url(driver="psycopg")
    sync_db_engine = create_engine(db_url)
    try:
        yield sync_db_engine
    finally:
        sync_db_engine.dispose()


@pytest.fixture(autouse=True)
def _cleanup_database(async_engine: AsyncEngine, request) -> None:
    """Clear all tables before each test to keep isolation simple with AsyncSession."""
    from viewport.models.db import Base

    async def _truncate() -> None:
        async with async_engine.begin() as conn:
            table_names = [table.name for table in Base.metadata.tables.values()]
            if table_names:
                await conn.execute(text(f"TRUNCATE {', '.join(table_names)} CASCADE;"))

    asyncio.run(_truncate())


@pytest_asyncio.fixture(scope="function")
async def db_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    """Фикстура сессии базы данных с изоляцией на каждый тест."""
    session_factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()


@pytest.fixture(scope="session")
def s3_container(request: pytest.FixtureRequest) -> Generator[S3ConnectionInfo | DockerContainer]:
    """S3 testcontainer shared for the entire test session."""
    worker_input = getattr(request.config, "workerinput", {})
    shared_info = worker_input.get("shared_s3")
    default_bucket = f"test-viewport-default-{_worker_id_from_config(request.config)}"

    if shared_info:
        s3_info = S3ConnectionInfo.from_dict(shared_info)
        env_updates = _build_s3_env(endpoint_url=s3_info.endpoint_url, bucket_name=default_bucket)

        with _temporary_env_vars(env_updates):
            if not _ensure_s3_bucket(s3_info.endpoint_url, default_bucket, env_updates["S3_SIGNATURE_VERSION"]):
                raise RuntimeError(f"Unable to ensure S3 bucket {default_bucket} for tests")
            yield s3_info
        return

    container = _start_s3_container()
    try:
        s3_info = _connection_info_from_s3_container(container)
        env_updates = _build_s3_env(endpoint_url=s3_info.endpoint_url, bucket_name=default_bucket)

        with _temporary_env_vars(env_updates):
            if not _ensure_s3_bucket(s3_info.endpoint_url, default_bucket, env_updates["S3_SIGNATURE_VERSION"]):
                raise RuntimeError(f"Unable to ensure S3 bucket {default_bucket} for tests")
            yield container
    finally:
        container.stop()


@pytest.fixture(autouse=True)
def _s3_test_bucket(request: pytest.FixtureRequest) -> Generator[None]:
    """Provide isolated S3 bucket per test, avoiding cross-test data pollution."""
    if not _needs_s3_for_request(request):
        yield
        return

    request.getfixturevalue("s3_container")

    worker_id = _worker_id_from_config(request.config)
    bucket_name = f"test-viewport-{worker_id}-{uuid.uuid4().hex}"
    endpoint_url = os.environ["S3_ENDPOINT"]
    signature_version = os.environ.get("S3_SIGNATURE_VERSION", "s3v4")

    with _temporary_env_vars({"S3_BUCKET": bucket_name}):
        if not _ensure_s3_bucket(endpoint_url, bucket_name, signature_version):
            raise RuntimeError(f"Unable to ensure isolated S3 bucket {bucket_name} for test")

        _clear_s3_cache()
        _refresh_app_s3_client_instance()
        try:
            yield
        finally:
            _clear_s3_cache()
            _refresh_app_s3_client_instance()


@pytest.fixture(scope="session")
def valkey_container(request: pytest.FixtureRequest) -> Generator[str]:
    """ValKey container shared per session with worker-specific Redis DB."""
    worker_input = getattr(request.config, "workerinput", {})
    shared_info = worker_input.get("shared_valkey")
    db_index = _worker_redis_db_index(request.config)

    if shared_info:
        valkey_info = ValkeyConnectionInfo.from_dict(shared_info)
        yield valkey_info.redis_url(db_index)
        return

    container = _start_valkey_container()
    try:
        valkey_info = _connection_info_from_valkey_container(container)
        yield valkey_info.redis_url(db_index)
    finally:
        container.stop()


@pytest.fixture(scope="session", autouse=True)
def _redis_test_env(valkey_container: str) -> Generator[None]:
    with _temporary_env_vars({"REDIS_URL": valkey_container}):
        from viewport.services.redis_service import get_redis_settings

        get_redis_settings.cache_clear()
        try:
            yield
        finally:
            get_redis_settings.cache_clear()


@pytest.fixture(scope="session")
def _db_session_holder() -> dict[str, AsyncSession | None]:
    return {"session": None}


@pytest.fixture(scope="session")
def app_client(
    postgres_container: PostgresConnectionInfo,
    s3_container: S3ConnectionInfo | DockerContainer,
    _redis_test_env: None,
    _db_session_holder: dict[str, AsyncSession | None],
):
    """Session-scoped TestClient with dynamic DB session override."""

    from viewport.main import app
    from viewport.models.db import get_db

    async def override_get_db():
        session = _db_session_holder["session"]
        if session is None:
            raise RuntimeError("db_session is not set for current test")
        yield session

    app.dependency_overrides[get_db] = override_get_db

    _clear_s3_cache()

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def client(db_session: AsyncSession, app_client: TestClient, _db_session_holder: dict[str, AsyncSession | None], request: pytest.FixtureRequest):
    """Фикстура тестового клиента FastAPI с очисткой состояния между тестами."""
    _db_session_holder["session"] = db_session
    default_headers = dict(app_client.headers)
    app_client.headers.clear()
    app_client.headers.update(default_headers)

    if _needs_s3_for_request(request):
        request.getfixturevalue("s3_container")
        _clear_s3_cache()
        _refresh_app_s3_client_instance()

    try:
        yield app_client
    finally:
        _db_session_holder["session"] = None
        app_client.headers.clear()
        app_client.headers.update(default_headers)


@pytest.fixture(scope="function")
def test_user_data() -> dict[str, str]:
    """Данные тестового пользователя."""
    return {"email": "botuhh@example.com", "password": "testpassword123", "invite_code": "testinvitecode"}


@pytest.fixture(scope="function")
def auth_token(client: TestClient, test_user_data: dict[str, str]) -> str:
    """Register/login a user once per test to return a valid access token."""
    register_response = client.post("/auth/register", json=test_user_data)
    assert register_response.status_code in {200, 201}

    login_response = client.post("/auth/login", json=test_user_data)
    assert login_response.status_code == 200

    return login_response.json()["tokens"]["access_token"]


@pytest.fixture(scope="function")
def authenticated_client(client: TestClient, auth_token: str) -> Generator[TestClient]:
    """Тестовый клиент с предустановленной аутентификацией."""
    client.headers.update({"Authorization": f"Bearer {auth_token}"})
    yield client
    client.headers.pop("Authorization", None)


@pytest.fixture(scope="function")
def gallery_fixture(authenticated_client: TestClient) -> str:
    """Фикстура для создания тестовой галереи."""
    response = authenticated_client.post("/galleries/", json={})
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture(scope="function")
def sharelink_fixture(authenticated_client: TestClient, gallery_fixture: str) -> str:
    """Фикстура для создания тестовой ссылки доступа."""
    expires = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    payload = {"gallery_id": gallery_fixture, "expires_at": expires}
    response = authenticated_client.post(f"/galleries/{gallery_fixture}/share-links", json=payload)
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture(scope="function")
def multiple_users_data() -> list[dict[str, str]]:
    """Fixture providing multiple user data for multi-user tests."""
    return [
        {"email": "user1@example.com", "password": "password123", "invite_code": "testinvitecode"},
        {"email": "user2@example.com", "password": "password456", "invite_code": "testinvitecode"},
        {"email": "user3@example.com", "password": "password789", "invite_code": "testinvitecode"},
        {"email": "user4@example.com", "password": "passwordabc", "invite_code": "testinvitecode"},
        {"email": "user5@example.com", "password": "passworddef", "invite_code": "testinvitecode"},
    ]


@pytest.fixture(scope="function")
def gallery_id_fixture(authenticated_client: TestClient) -> str:
    """Fixture that creates a gallery and returns its ID."""
    # Create a gallery for tests needing a gallery ID
    resp = authenticated_client.post("/galleries", json={})
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture(scope="function")
def sharelink_data(authenticated_client: TestClient, gallery_id_fixture: str) -> tuple[str, str]:
    """Fixture that creates a share link for a gallery and returns (share_id, gallery_id)."""
    # Prepare expiration in future
    expires = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    payload = {"gallery_id": gallery_id_fixture, "expires_at": expires}
    resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
    assert resp.status_code == 201
    share_id = resp.json()["id"]
    return share_id, gallery_id_fixture


@pytest.fixture(scope="function")
def invalid_auth_headers() -> dict[str, str]:
    """Fixture providing invalid authorization header."""
    return {"Authorization": "Bearer invalid_token"}


@pytest.fixture(scope="function")
def expired_auth_headers() -> dict[str, str]:
    """Fixture providing expired access token in Authorization header."""
    # Generate a token expired in the past

    from viewport.auth_utils import authsettings

    payload = {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) - timedelta(days=1), "type": "access"}
    token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}
