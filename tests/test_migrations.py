import uuid
from pathlib import Path

import pytest
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
            assert inspector.has_table("refresh_token_sessions")
            refresh_columns = {column["name"] for column in inspector.get_columns("refresh_token_sessions")}
            assert refresh_columns == {
                "jti_hash",
                "user_id",
                "family_id",
                "parent_jti_hash",
                "issued_at",
                "expires_at",
                "used_at",
                "revoked_at",
                "replaced_by_jti_hash",
            }
            refresh_indexes = {index["name"] for index in inspector.get_indexes("refresh_token_sessions")}
            assert {
                "ix_refresh_token_sessions_expires_at",
                "ix_refresh_token_sessions_family_id",
                "ix_refresh_token_sessions_revoked_at",
                "ix_refresh_token_sessions_user_active",
            } <= refresh_indexes
            refresh_foreign_keys = inspector.get_foreign_keys("refresh_token_sessions")
            assert any(
                foreign_key["referred_table"] == "users" and foreign_key["constrained_columns"] == ["user_id"] and foreign_key["options"].get("ondelete") == "CASCADE"
                for foreign_key in refresh_foreign_keys
            )

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


def test_media_fields_backfill_existing_photos_as_image(postgres_container) -> None:
    """After upgrading through the media-fields migration, every pre-existing
    photo row MUST have media_type='image' and NULL playback/duration fields."""
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_media_backfill_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.connect() as connection:
            config.attributes["connection"] = connection
            # Upgrade to the revision just before media fields are added
            command.upgrade(config, "703516a7aa97")

            user_id = uuid.uuid4()
            gallery_id = uuid.uuid4()

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
                    "email": f"media-backfill-{user_id.hex}@example.com",
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
                        :id, :owner_id, NULL, :name, :created_at, false, 0,
                        'direct_only', :shooting_date, 'uploaded_at', 'desc', NULL
                    )
                    """
                ),
                {
                    "id": gallery_id,
                    "owner_id": user_id,
                    "name": "Media Backfill Gallery",
                    "created_at": "2026-07-10 12:00:00",
                    "shooting_date": "2026-07-09",
                },
            )

            # Insert several photos that existed before media fields were added
            photo_ids = [uuid.uuid4() for _ in range(3)]
            for photo_id in photo_ids:
                connection.execute(
                    text(
                        """
                        INSERT INTO photos (
                            id, gallery_id, object_key, file_size, uploaded_at,
                            thumbnail_object_key, display_name, status
                        ) VALUES (
                            :id, :gallery_id, :object_key, :file_size, NOW(),
                            :thumbnail_object_key, :display_name, 1
                        )
                        """
                    ),
                    {
                        "id": photo_id,
                        "gallery_id": gallery_id,
                        "object_key": f"photos/{photo_id}.jpg",
                        "file_size": 1024,
                        "thumbnail_object_key": f"thumbs/{photo_id}.jpg",
                        "display_name": f"photo-{photo_id.hex[:8]}.jpg",
                    },
                )

            connection.commit()

            # Now upgrade through the media-fields migration to head
            command.upgrade(config, "head")

            # Assert every pre-existing photo was backfilled correctly
            result = (
                connection.execute(
                    text(
                        """
                    SELECT id, media_type, playback_object_key, duration_ms
                    FROM photos
                    WHERE id = ANY(:photo_ids)
                    """
                    ),
                    {"photo_ids": photo_ids},
                )
                .mappings()
                .all()
            )

            assert len(result) == 3
            for row in result:
                assert row["media_type"] == "image", f"Expected media_type='image', got {row['media_type']}"
                assert row["playback_object_key"] is None, f"Expected playback_object_key IS NULL, got {row['playback_object_key']}"
                assert row["duration_ms"] is None, f"Expected duration_ms IS NULL, got {row['duration_ms']}"

    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)


def test_media_type_check_constraint_rejects_invalid(postgres_container) -> None:
    """The CHECK constraint ck_photos_media_type MUST reject any media_type
    that is not 'image' or 'video'."""
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_media_ck_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

            user_id = uuid.uuid4()
            gallery_id = uuid.uuid4()

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
                {"id": user_id, "email": f"media-ck-{user_id.hex}@example.com", "password_hash": "hashed"},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO galleries (
                        id, owner_id, project_id, name, created_at, is_deleted, project_position,
                        project_visibility, shooting_date, public_sort_by, public_sort_order, cover_photo_id
                    ) VALUES (
                        :id, :owner_id, NULL, :name, :created_at, false, 0,
                        'direct_only', :shooting_date, 'uploaded_at', 'desc', NULL
                    )
                    """
                ),
                {
                    "id": gallery_id,
                    "owner_id": user_id,
                    "name": "Constraint Test Gallery",
                    "created_at": "2026-07-10 12:00:00",
                    "shooting_date": "2026-07-09",
                },
            )
            connection.commit()

            from sqlalchemy.exc import IntegrityError

            with pytest.raises(IntegrityError):
                connection.execute(
                    text(
                        """
                        INSERT INTO photos (
                            id, gallery_id, object_key, file_size, uploaded_at,
                            thumbnail_object_key, display_name, status, media_type
                        ) VALUES (
                            :id, :gallery_id, :object_key, :file_size, NOW(),
                            :thumbnail_object_key, :display_name, 1, :media_type
                        )
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "gallery_id": gallery_id,
                        "object_key": f"photos/audio-{uuid.uuid4().hex}.mp3",
                        "file_size": 2048,
                        "thumbnail_object_key": "thumbs/audio-thumb.jpg",
                        "display_name": "audio.mp3",
                        "media_type": "audio",
                    },
                )
                connection.rollback()

    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)


def test_duration_ms_check_constraint_rejects_negative(postgres_container) -> None:
    """The CHECK constraint ck_photos_duration_ms_nonnegative MUST reject
    negative duration_ms values."""
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_duration_ck_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

            user_id = uuid.uuid4()
            gallery_id = uuid.uuid4()

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
                {"id": user_id, "email": f"dur-ck-{user_id.hex}@example.com", "password_hash": "hashed"},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO galleries (
                        id, owner_id, project_id, name, created_at, is_deleted, project_position,
                        project_visibility, shooting_date, public_sort_by, public_sort_order, cover_photo_id
                    ) VALUES (
                        :id, :owner_id, NULL, :name, :created_at, false, 0,
                        'direct_only', :shooting_date, 'uploaded_at', 'desc', NULL
                    )
                    """
                ),
                {
                    "id": gallery_id,
                    "owner_id": user_id,
                    "name": "Duration Constraint Gallery",
                    "created_at": "2026-07-10 12:00:00",
                    "shooting_date": "2026-07-09",
                },
            )
            connection.commit()

            from sqlalchemy.exc import IntegrityError

            with pytest.raises(IntegrityError):
                connection.execute(
                    text(
                        """
                        INSERT INTO photos (
                            id, gallery_id, object_key, file_size, uploaded_at,
                            thumbnail_object_key, display_name, status, media_type, duration_ms
                        ) VALUES (
                            :id, :gallery_id, :object_key, :file_size, NOW(),
                            :thumbnail_object_key, :display_name, 1, :media_type, :duration_ms
                        )
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "gallery_id": gallery_id,
                        "object_key": f"photos/negative-dur-{uuid.uuid4().hex}.mp4",
                        "file_size": 4096,
                        "thumbnail_object_key": "thumbs/neg-dur-thumb.jpg",
                        "display_name": "negative-dur.mp4",
                        "media_type": "video",
                        "duration_ms": -1,
                    },
                )
                connection.rollback()

    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)


def test_multipart_upload_id_column_added(postgres_container) -> None:
    """After upgrading to head, the photos table MUST include the
    multipart_upload_id column as nullable."""
    admin_url = postgres_container.get_connection_url(driver="psycopg")
    db_name = f"alembic_multipart_{uuid.uuid4().hex}"

    _create_database(admin_url, db_name)

    migration_url = make_url(admin_url).set(database=db_name)
    migration_url_str = migration_url.render_as_string(hide_password=False)
    config = _make_alembic_config(migration_url_str)

    migration_engine = create_engine(migration_url_str)
    try:
        with migration_engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

            inspector = inspect(connection)
            photo_columns = {col["name"]: col for col in inspector.get_columns("photos")}

            assert "multipart_upload_id" in photo_columns, f"multipart_upload_id column missing; columns: {sorted(photo_columns.keys())}"
            assert photo_columns["multipart_upload_id"]["nullable"] is True, "multipart_upload_id must be nullable"

    finally:
        migration_engine.dispose()
        _drop_database(admin_url, db_name)
