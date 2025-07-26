import os
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from testcontainers.core.container import DockerContainer
from testcontainers.postgres import PostgresContainer

import src.viewport.db as db
from src.viewport.db import Base
from src.viewport.main import app

# Set MinIO endpoint for tests
os.environ["MINIO_ENDPOINT"] = "localhost:9000"


# Use a session-scoped Postgres testcontainer
@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer(image="postgres:17-alpine") as postgres:
        yield postgres


@pytest.fixture(scope="session")
def test_engine(postgres_container):
    db_url = postgres_container.get_connection_url()
    os.environ["DATABASE_URL"] = db_url
    db.engine = db.create_engine(db_url)
    db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)
    return db.engine


@pytest.fixture(scope="function")
def setup_db(test_engine):
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


# Test clients
@pytest.fixture(scope="function")
def client(setup_db):
    """Unauthenticated test client."""
    from src.viewport.main import app

    return TestClient(app)


@pytest.fixture(scope="function")
def test_user_data():
    """Default test user data."""
    return {"email": "testuser@example.com", "password": "testpassword123"}


@pytest.fixture(scope="function")
def auth_headers(client, test_user_data) -> dict[str, str]:
    """Create a user and return authentication headers."""
    # Register user
    reg_response = client.post("/auth/register", json=test_user_data)
    assert reg_response.status_code == 201

    # Login and get token
    login_response = client.post("/auth/login", json=test_user_data)
    assert login_response.status_code == 200

    token = login_response.json()["tokens"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def gallery_id_fixture(authenticated_client) -> str:
    """Create a gallery and return its ID."""
    response = authenticated_client.post("/galleries", json={})
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture(scope="function")
def sharelink_data(authenticated_client, gallery_id_fixture) -> tuple[str, str]:
    """Create a share link and return (share_id, gallery_id)."""
    expires = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    share_payload = {"gallery_id": gallery_id_fixture, "expires_at": expires}

    response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=share_payload)
    assert response.status_code == 201

    share_id = response.json()["id"]
    return share_id, gallery_id_fixture


# Helper functions for common test operations
def register_and_login(client: TestClient, email: str, password: str) -> str:
    """Register a user and return their access token."""
    reg_payload = {"email": email, "password": password}
    reg_response = client.post("/auth/register", json=reg_payload)
    assert reg_response.status_code == 201

    login_response = client.post("/auth/login", json=reg_payload)
    assert login_response.status_code == 200

    return login_response.json()["tokens"]["access_token"]


def create_user_with_gallery(client: TestClient, email: str, password: str) -> tuple[str, str, dict[str, str]]:
    """Create a user with a gallery and return (gallery_id, user_token, headers)."""
    token = register_and_login(client, email, password)
    headers = {"Authorization": f"Bearer {token}"}

    gallery_response = client.post("/galleries", json={}, headers=headers)
    assert gallery_response.status_code == 201

    gallery_id = gallery_response.json()["id"]
    return gallery_id, token, headers


def create_sharelink(client: TestClient, gallery_id: str, headers: dict[str, str], expires_days: int = 1) -> str:
    """Create a share link for a gallery and return the share ID."""
    expires = (datetime.now(UTC) + timedelta(days=expires_days)).isoformat()
    share_payload = {"gallery_id": gallery_id, "expires_at": expires}

    response = client.post(f"/galleries/{gallery_id}/share-links", json=share_payload, headers=headers)
    assert response.status_code == 201

    return response.json()["id"]


# MinIO testcontainer fixture
MINIO_IMAGE = "minio/minio:latest"
MINIO_ROOT_USER = "minioadmin"
MINIO_ROOT_PASSWORD = "minioadmin"
MINIO_PORT = 9000


@pytest.fixture(scope="session")
def minio_container():
    container = (
        DockerContainer(MINIO_IMAGE)
        .with_env("MINIO_ROOT_USER", MINIO_ROOT_USER)
        .with_env("MINIO_ROOT_PASSWORD", MINIO_ROOT_PASSWORD)
        .with_exposed_ports(MINIO_PORT)
        .with_command("server /data --console-address :9001")
    )
    with container as minio:
        time.sleep(3)  # Optionally, poll health endpoint instead
        host = minio.get_container_host_ip()
        port = minio.get_exposed_port(MINIO_PORT)
        endpoint = f"{host}:{port}"
        os.environ["MINIO_ENDPOINT"] = endpoint
        os.environ["MINIO_ACCESS_KEY"] = MINIO_ROOT_USER
        os.environ["MINIO_SECRET_KEY"] = MINIO_ROOT_PASSWORD
        yield {
            "endpoint": endpoint,
            "access_key": MINIO_ROOT_USER,
            "secret_key": MINIO_ROOT_PASSWORD,
        }


# Use a session-scoped Postgres testcontainer
@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer(image="postgres:17-alpine") as postgres:
        yield postgres


# Ensure MinIO is running for all tests by making minio_container a session fixture dependency
@pytest.fixture(autouse=True, scope="session")
def _ensure_minio(minio_container):
    # This will start MinIO before any test runs
    pass


@pytest.fixture(scope="session")
def test_engine(postgres_container):
    db_url = postgres_container.get_connection_url()
    os.environ["DATABASE_URL"] = db_url
    db.engine = db.create_engine(db_url)
    db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)
    return db.engine


@pytest.fixture(scope="function")
def setup_db(test_engine):
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


# Test clients
@pytest.fixture(scope="function")
def client(setup_db, minio_container):
    """Unauthenticated test client. Depends on MinIO being up."""
    return TestClient(app)


@pytest.fixture(scope="function")
def test_user_data():
    """Default test user data."""
    return {"email": "testuser@example.com", "password": "testpassword123"}


@pytest.fixture(scope="function")
def auth_headers(client, test_user_data) -> dict[str, str]:
    """Create a user and return authentication headers."""
    # Register user
    reg_response = client.post("/auth/register", json=test_user_data)
    assert reg_response.status_code == 201

    # Login and get token
    login_response = client.post("/auth/login", json=test_user_data)
    assert login_response.status_code == 200

    token = login_response.json()["tokens"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def authenticated_client(client, auth_headers):
    """Test client with authentication headers already set."""

    class AuthenticatedTestClient:
        def __init__(self, test_client: TestClient, headers: dict[str, str]):
            self._client = test_client
            self._headers = headers

        def get(self, url, **kwargs):
            kwargs.setdefault("headers", {}).update(self._headers)
            return self._client.get(url, **kwargs)

        def post(self, url, **kwargs):
            kwargs.setdefault("headers", {}).update(self._headers)
            return self._client.post(url, **kwargs)

        def put(self, url, **kwargs):
            kwargs.setdefault("headers", {}).update(self._headers)
            return self._client.put(url, **kwargs)

        def delete(self, url, **kwargs):
            kwargs.setdefault("headers", {}).update(self._headers)
            return self._client.delete(url, **kwargs)

        def patch(self, url, **kwargs):
            kwargs.setdefault("headers", {}).update(self._headers)
            return self._client.patch(url, **kwargs)

        # Expose the underlying client for other methods
        @property
        def client(self):
            return self._client

        @property
        def headers(self):
            return self._headers

    return AuthenticatedTestClient(client, auth_headers)
