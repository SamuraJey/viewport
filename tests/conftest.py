import os
import pytest
from testcontainers.postgres import PostgresContainer
from sqlalchemy.orm import sessionmaker
import src.app.db as db
from src.app.models.user import Base as UserBase
from src.app.models.gallery import Base as GalleryBase

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
    UserBase.metadata.create_all(bind=test_engine)
    GalleryBase.metadata.create_all(bind=test_engine)
    yield
    UserBase.metadata.drop_all(bind=test_engine)
    GalleryBase.metadata.drop_all(bind=test_engine)
