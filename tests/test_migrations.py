import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


def _make_alembic_config(db_url: str) -> Config:
    repo_root = Path(__file__).resolve().parents[1]
    config = Config(str(repo_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url)
    return config


def _create_database(admin_url: str, db_name: str) -> None:
    admin_engine = create_engine(admin_url)
    try:
        with admin_engine.connect() as connection:
            connection = connection.execution_options(isolation_level="AUTOCOMMIT")
            connection.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        admin_engine.dispose()


def _drop_database(admin_url: str, db_name: str) -> None:
    admin_engine = create_engine(admin_url)
    try:
        with admin_engine.connect() as connection:
            connection = connection.execution_options(isolation_level="AUTOCOMMIT")
            connection.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
    finally:
        admin_engine.dispose()


def test_alembic_upgrade_and_downgrade(postgres_container) -> None:
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_test_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)
    script = ScriptDirectory.from_config(config)
    head_revision = script.get_current_head()
    assert head_revision is not None

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

            inspector = inspect(connection)
            assert inspector.has_table("alembic_version")
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            assert version == head_revision

            command.downgrade(config, "base")

            inspector = inspect(connection)
            if inspector.has_table("alembic_version"):
                remaining = connection.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar_one()
                assert remaining == 0
    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)
