import logging
import os
import time
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

S3_IMAGE = "rustfs/rustfs:1.0.0-alpha.78"
S3_ROOT_ACCESS_KEY = "minioadmin"
S3_ROOT_SECRET_KEY = "minioadmin"
S3_PORT = 9000

logger = logging.getLogger(__name__)

os.environ.update({"JWT_SECRET_KEY": "supersecretkey", "ADMIN_JWT_SECRET_KEY": "adminsecretkey", "INVITE_CODE": "testinvitecode"})


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
                "POSTGRES_PORT": str(url.port or 5432),
            }
        )

        yield container


@pytest.fixture(scope="session")
def engine(postgres_container: PostgresContainer) -> Generator[Engine]:
    """Фикстура движка SQLAlchemy с областью видимости на сессию."""

    from viewport.models import Gallery, Photo, ShareLink, User  # noqa: F401
    from viewport.models.db import Base

    db_url = postgres_container.get_connection_url(driver="psycopg")
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
def s3_container() -> Generator[DockerContainer]:
    """Фикстура контейнера S3 с областью видимости на сессию."""
    import boto3
    from botocore.config import Config

    container = (
        DockerContainer(S3_IMAGE).with_env("RUSTFS_ACCESS_KEY", S3_ROOT_ACCESS_KEY).with_env("RUSTFS_SECRET_KEY", S3_ROOT_SECRET_KEY).with_exposed_ports(S3_PORT)
        # .with_command("server /data --console-address :9001")
    )

    with container as s3_test_container:
        host = s3_test_container.get_container_host_ip()
        port = s3_test_container.get_exposed_port(S3_PORT)

        # Set environment variables
        os.environ.update(
            {
                "S3_ENDPOINT": f"http://{host}:{port}",
                "S3_ACCESS_KEY": S3_ROOT_ACCESS_KEY,
                "S3_SECRET_KEY": S3_ROOT_SECRET_KEY,
                "S3_BUCKET": "test-viewport",
                "S3_REGION": "us-east-1",
                "S3_USE_SSL": "false",
                "S3_SIGNATURE_VERSION": "s3v4",
            }
        )

        endpoint_url = f"http://{host}:{port}"
        bucket_name = os.environ["S3_BUCKET"]

        # Try to create the bucket via S3 API as well (preferred path)
        def _make_config(signature: str) -> Config:
            return Config(
                s3={"addressing_style": "path"},
                signature_version=signature,
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            )

        def _try_create_bucket(signature: str) -> bool:
            client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=S3_ROOT_ACCESS_KEY,
                aws_secret_access_key=S3_ROOT_SECRET_KEY,
                region_name=os.environ.get("S3_REGION", "us-east-1"),
                config=_make_config(signature),
            )

            for _ in range(60):
                try:
                    client.create_bucket(Bucket=bucket_name)
                    return True
                except client.exceptions.BucketAlreadyOwnedByYou:
                    return True
                except client.exceptions.BucketAlreadyExists:
                    return True
                except Exception as exc:  # noqa: BLE001 - log for debugging signature mismatch
                    logger.warning("Error creating S3 bucket via API (sig=%s): %s", signature, exc)
                    time.sleep(0.1)
            return False

        signature_version = os.environ["S3_SIGNATURE_VERSION"]
        bucket_ready = _try_create_bucket(signature_version)

        if not bucket_ready and signature_version != "s3v4":
            os.environ["S3_SIGNATURE_VERSION"] = "s3v4"
            logger.info("Retrying S3 bucket setup with signature v4 due to previous failures")
            bucket_ready = _try_create_bucket("s3v4")

        yield s3_test_container


@pytest.fixture(scope="function")
def client(db_session: Session, s3_container: DockerContainer):
    """Фикстура тестового клиента FastAPI с очисткой состояния между тестами."""

    # Override get_db to use the transactional db_session for each test
    from viewport.main import app
    from viewport.models.db import get_db

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Ensure MinIO cache is cleared for each test to pick up fresh configuration
    try:
        from viewport.minio_utils import get_minio_config, get_s3_client

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
    import uuid

    import jwt

    from viewport.auth_utils import authsettings

    payload = {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) - timedelta(days=1), "type": "access"}
    token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}
