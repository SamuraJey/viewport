import os
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.engine.base import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.session import Session
from testcontainers.core.container import DockerContainer
from testcontainers.postgres import PostgresContainer

POSTGRES_IMAGE = "postgres:17-alpine"

MINIO_IMAGE = "minio/minio:RELEASE.2025-07-23T15-54-02Z"
MINIO_ROOT_USER = "minioadmin"
MINIO_ROOT_PASSWORD = "minioadmin"
MINIO_PORT = 9000

os.environ.update({"JWT_SECRET_KEY": "supersecretkey", "INVITE_CODE": "testinvitecode"})


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer]:
    """Фикстура контейнера PostgreSQL с областью видимости на всю сессию тестов."""
    with PostgresContainer(image=POSTGRES_IMAGE) as container:
        # Выставляем переменные окружения POSTGRES_* как в MinIO фикстуре
        # чтобы код, читающий настройки из окружения, указывал на этот контейнер
        db_url = container.get_connection_url()
        url = make_url(db_url)
        os.environ.update(
            {
                "POSTGRES_DB": url.database or "",
                "POSTGRES_USER": url.username or "",
                "POSTGRES_PASSWORD": url.password or "",
                "POSTGRES_HOST": url.host or "",
            }
        )

        yield container


@pytest.fixture(scope="session")
def engine(postgres_container: PostgresContainer) -> Generator[Engine]:
    """Фикстура движка SQLAlchemy с областью видимости на сессию."""
    from src.viewport.db import Base
    from src.viewport.models import Gallery, Photo, ShareLink, User  # noqa: F401

    db_url = postgres_container.get_connection_url()
    engine = create_engine(db_url)
    # Create all tables once at session startup
    Base.metadata.create_all(engine)
    yield engine
    # Drop all tables and dispose engine at session teardown
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(engine: Engine) -> Generator[Session]:
    """Фикстура сессии базы данных с изоляцией на каждый тест."""
    connection = engine.connect()
    transaction = connection.begin()
    session_factory = sessionmaker(bind=connection)
    session = session_factory()

    yield session

    # Откатываем транзакцию и закрываем соединение после теста
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="session")
def minio_container() -> Generator[DockerContainer]:
    """Фикстура контейнера MinIO с областью видимости на сессию."""
    from testcontainers.core.container import DockerContainer

    container = (
        DockerContainer(MINIO_IMAGE)
        .with_env("MINIO_ROOT_USER", MINIO_ROOT_USER)
        .with_env("MINIO_ROOT_PASSWORD", MINIO_ROOT_PASSWORD)
        .with_exposed_ports(MINIO_PORT)
        .with_command("server /data --console-address :9001")
    )

    with container as minio:
        host = minio.get_container_host_ip()
        port = minio.get_exposed_port(MINIO_PORT)

        # Set environment variables
        os.environ.update(
            {
                "MINIO_ENDPOINT": f"{host}:{port}",
                "MINIO_ACCESS_KEY": MINIO_ROOT_USER,
                "MINIO_SECRET_KEY": MINIO_ROOT_PASSWORD,
                "MINIO_ROOT_USER": MINIO_ROOT_USER,
                "MINIO_ROOT_PASSWORD": MINIO_ROOT_PASSWORD,
            }
        )

        # Clear any cached MinIO configurations to force reload
        from src.viewport.minio_utils import get_minio_config, get_s3_client

        get_minio_config.cache_clear()
        get_s3_client.cache_clear()

        yield minio


@pytest.fixture(scope="function")
def client(db_session: Session, minio_container: DockerContainer):
    """Фикстура тестового клиента FastAPI с очисткой состояния между тестами."""

    # Override get_db to use the transactional db_session for each test
    from src.viewport.db import get_db
    from src.viewport.main import app

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Ensure MinIO cache is cleared for each test to pick up fresh configuration
    try:
        from src.viewport.minio_utils import get_minio_config, get_s3_client

        get_minio_config.cache_clear()
        get_s3_client.cache_clear()
    except ImportError:  # pragma: no cover
        pass  # If MinIO utils aren't available, that's fine

    with TestClient(app) as test_client:
        yield test_client

    # Clear overrides after test
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user_data() -> dict[str, str]:
    """Данные тестового пользователя."""
    return {"email": "botuhh@example.com", "password": "testpassword123", "invite_code": "testinvitecode"}


@pytest.fixture(scope="function")
def authenticated_client(client: TestClient, test_user_data: dict[str, str]) -> Generator[TestClient]:
    """Тестовый клиент с предустановленной аутентификацией."""
    client.post("/auth/register", json=test_user_data)

    # Аутентификация

    response = client.post("/auth/login", json=test_user_data)

    token = response.json()["tokens"]["access_token"]

    client.headers.update({"Authorization": f"Bearer {token}"})
    yield client
    # Очистка заголовков после теста
    client.headers.clear()


@pytest.fixture(scope="function")
def gallery_fixture(authenticated_client: TestClient) -> str:
    """Фикстура для создания тестовой галереи."""
    response = authenticated_client.post("/galleries/", json={})
    return response.json()["id"]


@pytest.fixture(scope="function")
def sharelink_fixture(authenticated_client: TestClient, gallery_fixture: str) -> str:
    """Фикстура для создания тестовой ссылки доступа."""
    expires = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    payload = {"gallery_id": gallery_fixture, "expires_at": expires}
    response = authenticated_client.post(f"/galleries/{gallery_fixture}/share-links", json=payload)
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
    resp = authenticated_client.post("/galleries/", json={})
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
    import uuid

    import jwt

    from src.viewport.api.auth import authsettings

    payload = {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) - timedelta(days=1), "type": "access"}
    token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}
