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
            gallery_columns = {column["name"] for column in inspector.get_columns("galleries")}
            assert {"private_notes", "public_description"} <= gallery_columns

            command.downgrade(config, "base")

            inspector = inspect(connection)
            if inspector.has_table("alembic_version"):
                remaining = connection.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar_one()
                assert remaining == 0
    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)


def test_project_only_backfill_migrates_orphan_galleries_into_projects(postgres_container) -> None:
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_backfill_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "f1a2b3c4d5e6")

            user_id = uuid.uuid4()
            gallery_id = uuid.uuid4()
            deleted_gallery_id = uuid.uuid4()
            share_link_id = uuid.uuid4()

            connection.execute(
                text(
                    """
                    INSERT INTO users (
                        id, email, password_hash, created_at, is_admin, storage_quota, storage_used, storage_reserved
                    ) VALUES (
                        :id, :email, :password_hash, NOW(), false, 10737418240, 0, 0
                    )
                    """
                ),
                {
                    "id": user_id,
                    "email": f"migrate-{user_id.hex}@example.com",
                    "password_hash": "hashed",
                },
            )
            connection.execute(
                text(
                    """
                    INSERT INTO galleries (
                        id, owner_id, project_id, name, created_at, is_deleted, project_position,
                        project_visibility, shooting_date, public_sort_by, public_sort_order, cover_photo_id
                    ) VALUES (
                        :id, :owner_id, NULL, :name, :created_at, false, 7,
                        'direct_only', :shooting_date, 'uploaded_at', 'desc', NULL
                    )
                    """
                ),
                {
                    "id": gallery_id,
                    "owner_id": user_id,
                    "name": "Legacy Orphan",
                    "created_at": "2026-04-10 12:00:00",
                    "shooting_date": "2026-04-09",
                },
            )
            connection.execute(
                text(
                    """
                    INSERT INTO galleries (
                        id, owner_id, project_id, name, created_at, is_deleted, project_position,
                        project_visibility, shooting_date, public_sort_by, public_sort_order, cover_photo_id
                    ) VALUES (
                        :id, :owner_id, NULL, :name, :created_at, true, 3,
                        'direct_only', :shooting_date, 'uploaded_at', 'desc', NULL
                    )
                    """
                ),
                {
                    "id": deleted_gallery_id,
                    "owner_id": user_id,
                    "name": "Deleted Legacy",
                    "created_at": "2026-04-11 12:00:00",
                    "shooting_date": "2026-04-10",
                },
            )
            connection.execute(
                text(
                    """
                    INSERT INTO share_links (
                        id, gallery_id, project_id, scope_type, label, is_active, expires_at, views,
                        zip_downloads, single_downloads, created_at, updated_at
                    ) VALUES (
                        :id, :gallery_id, NULL, 'gallery', 'Legacy share', true, NULL, 0,
                        0, 0, NOW(), NOW()
                    )
                    """
                ),
                {"id": share_link_id, "gallery_id": gallery_id},
            )
            connection.commit()

            command.upgrade(config, "head")

            migrated_gallery = (
                connection.execute(
                    text(
                        """
                    SELECT project_id, project_position, project_visibility
                    FROM galleries
                    WHERE id = :gallery_id
                    """
                    ),
                    {"gallery_id": gallery_id},
                )
                .mappings()
                .one()
            )
            assert migrated_gallery["project_id"] is not None
            assert migrated_gallery["project_position"] == 0
            assert migrated_gallery["project_visibility"] == "listed"

            migrated_project = (
                connection.execute(
                    text(
                        """
                    SELECT owner_id, name, shooting_date
                    FROM projects
                    WHERE id = :project_id
                    """
                    ),
                    {"project_id": migrated_gallery["project_id"]},
                )
                .mappings()
                .one()
            )
            assert migrated_project["owner_id"] == user_id
            assert migrated_project["name"] == "Legacy Orphan"
            assert str(migrated_project["shooting_date"]) == "2026-04-09"

            orphan_count = connection.execute(text("SELECT COUNT(*) FROM galleries WHERE project_id IS NULL")).scalar_one()
            assert orphan_count == 1

            deleted_gallery_row = (
                connection.execute(
                    text("SELECT project_id, is_deleted FROM galleries WHERE id = :gallery_id"),
                    {"gallery_id": deleted_gallery_id},
                )
                .mappings()
                .one()
            )
            assert deleted_gallery_row["project_id"] is None
            assert deleted_gallery_row["is_deleted"] is True

            deleted_project_count = connection.execute(text("SELECT COUNT(*) FROM projects WHERE name = 'Deleted Legacy'")).scalar_one()
            assert deleted_project_count == 0

            surviving_share_link = (
                connection.execute(
                    text("SELECT gallery_id, project_id FROM share_links WHERE id = :share_link_id"),
                    {"share_link_id": share_link_id},
                )
                .mappings()
                .one()
            )
            assert surviving_share_link["gallery_id"] == gallery_id
            assert surviving_share_link["project_id"] is None
    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)
