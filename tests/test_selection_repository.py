import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_selection import SelectionSessionStatus, ShareLinkSelectionConfig, ShareLinkSelectionItem, ShareLinkSelectionSession
from viewport.models.user import User
from viewport.repositories.selection_repository import SelectionRepository


class _ScalarOneOrNoneResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


@pytest_asyncio.fixture
async def repo(db_session) -> SelectionRepository:
    return SelectionRepository(db_session)


async def _create_owner_gallery_sharelinks(db_session):
    user = User(
        email=f"selection-{uuid4()}@example.com",
        password_hash="hashed",
        display_name="Selection Owner",
    )
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Selection Gallery")
    db_session.add(gallery)
    await db_session.commit()

    alpha_sharelink = ShareLink(gallery_id=gallery.id, label="Alpha")
    bravo_sharelink = ShareLink(gallery_id=gallery.id, label="bravo")
    charlie_sharelink = ShareLink(gallery_id=gallery.id, label="Charlie")
    db_session.add_all([alpha_sharelink, bravo_sharelink, charlie_sharelink])
    await db_session.commit()

    return user, gallery, alpha_sharelink, bravo_sharelink, charlie_sharelink


async def _create_config(db_session, sharelink: ShareLink, **kwargs) -> ShareLinkSelectionConfig:
    config = ShareLinkSelectionConfig(sharelink_id=sharelink.id, **kwargs)
    db_session.add(config)
    await db_session.commit()
    return config


async def _create_session(
    db_session,
    sharelink: ShareLink,
    config: ShareLinkSelectionConfig,
    *,
    client_name: str,
    status: str = SelectionSessionStatus.IN_PROGRESS.value,
    selected_count: int = 0,
    updated_at: datetime | None = None,
    created_at: datetime | None = None,
    submitted_at: datetime | None = None,
) -> ShareLinkSelectionSession:
    now = datetime.now(UTC)
    session = ShareLinkSelectionSession(
        sharelink_id=sharelink.id,
        config_id=config.id,
        client_name=client_name,
        client_email=None,
        client_phone=None,
        client_note=None,
        status=status,
        submitted_at=submitted_at,
        last_activity_at=updated_at or now,
        selected_count=selected_count,
        resume_token_hash=f"hash-{uuid4()}",
        created_at=created_at or now,
        updated_at=updated_at or now,
    )
    db_session.add(session)
    await db_session.commit()
    return session


async def _create_photo(db_session, gallery: Gallery, name: str) -> Photo:
    photo = Photo(
        gallery_id=gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{gallery.id}/{name}",
        display_name=name,
        thumbnail_object_key=f"{gallery.id}/thumb-{name}",
        file_size=1024,
    )
    db_session.add(photo)
    await db_session.commit()
    return photo


@pytest.mark.asyncio
async def test_get_or_create_config_reloads_existing_row_after_integrity_error():
    sharelink_id = uuid4()
    existing_config = ShareLinkSelectionConfig(sharelink_id=sharelink_id)
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _ScalarOneOrNoneResult(None),
            _ScalarOneOrNoneResult(existing_config),
        ]
    )
    db.commit = AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicate key")))
    db.rollback = AsyncMock()
    db.add = Mock()
    db.in_transaction = Mock(return_value=False)
    repo = SelectionRepository(db)

    config = await repo.get_or_create_config(sharelink_id)

    assert config is existing_config
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_or_create_config_reraises_integrity_error_when_row_is_still_missing():
    sharelink_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _ScalarOneOrNoneResult(None),
            _ScalarOneOrNoneResult(None),
        ]
    )
    error = IntegrityError("insert", {}, Exception("duplicate key"))
    db.commit = AsyncMock(side_effect=error)
    db.rollback = AsyncMock()
    db.add = Mock()
    db.in_transaction = Mock(return_value=False)
    repo = SelectionRepository(db)

    with pytest.raises(IntegrityError):
        await repo.get_or_create_config(sharelink_id)

    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_selection_repository_updates_config_and_session_helpers(repo: SelectionRepository, db_session):
    user, gallery, sharelink, _, _ = await _create_owner_gallery_sharelinks(db_session)
    config = await repo.get_or_create_config(sharelink.id)

    updated = await repo.update_config(
        sharelink.id,
        fields_set={"list_title", "require_email", "require_phone"},
        list_title="   ",
        require_email=True,
        require_phone=True,
    )
    assert updated.list_title == "Selected photos"
    assert updated.require_email is True
    assert updated.require_phone is True

    limited = await repo.update_config(
        sharelink.id,
        fields_set={"limit_enabled", "limit_value"},
        limit_enabled=True,
        limit_value=3,
    )
    assert limited.limit_enabled is True
    assert limited.limit_value == 3

    disabled_limit = await repo.update_config(
        sharelink.id,
        fields_set={"limit_enabled"},
        limit_enabled=False,
    )
    assert disabled_limit.limit_enabled is False
    assert disabled_limit.limit_value is None

    created_earlier = datetime.now(UTC) - timedelta(hours=2)
    updated_earlier = datetime.now(UTC) - timedelta(hours=1)
    created_later = datetime.now(UTC) - timedelta(minutes=30)
    updated_later = datetime.now(UTC) - timedelta(minutes=5)
    first_session = await _create_session(
        db_session,
        sharelink,
        config,
        client_name="First",
        created_at=created_earlier,
        updated_at=updated_earlier,
    )
    second_session = await _create_session(
        db_session,
        sharelink,
        config,
        client_name="Second",
        created_at=created_later,
        updated_at=updated_later,
    )

    latest = await repo.get_latest_session_for_sharelink(sharelink.id)
    alias_latest = await repo.get_session_for_sharelink(sharelink.id)
    session_count = await repo.count_sessions_for_sharelink(sharelink.id)

    assert latest is not None and latest.id == second_session.id
    assert alias_latest is not None and alias_latest.id == second_session.id
    assert session_count == 2

    photo = await _create_photo(db_session, gallery, "frame-01.jpg")
    item = await repo.upsert_selection_item(first_session.id, photo.id)
    assert item.comment is None
    updated = await repo.update_selection_item_comment(first_session.id, photo.id, comment="pick")
    assert updated is not None
    assert updated.comment == "pick"
    preserved = await repo.upsert_selection_item(first_session.id, photo.id)
    assert preserved.comment == "pick"
    cleared = await repo.update_selection_item_comment(first_session.id, photo.id, comment=None)
    assert cleared is not None
    assert cleared.comment is None
    assert await repo.delete_selection_item(first_session.id, photo.id) is True
    assert await repo.delete_selection_item(first_session.id, photo.id) is False
    assert await repo.get_latest_session_for_sharelink(uuid4()) is None


@pytest.mark.asyncio
async def test_selection_repository_upsert_selection_item_is_atomic_under_concurrent_inserts(
    db_session,
    async_engine,
):
    user, gallery, sharelink, _, _ = await _create_owner_gallery_sharelinks(db_session)
    config = await _create_config(db_session, sharelink, is_enabled=True)
    session = await _create_session(db_session, sharelink, config, client_name="Atomic")
    photo = await _create_photo(db_session, gallery, "race-frame.jpg")
    session_factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def _upsert_item():
        async with session_factory() as session_db:
            repo = SelectionRepository(session_db)
            return await repo.upsert_selection_item(session.id, photo.id)

    first_item, second_item = await asyncio.gather(_upsert_item(), _upsert_item())

    assert first_item.session_id == session.id
    assert second_item.session_id == session.id
    count_stmt = (
        select(func.count())
        .select_from(ShareLinkSelectionItem)
        .where(
            ShareLinkSelectionItem.session_id == session.id,
            ShareLinkSelectionItem.photo_id == photo.id,
        )
    )
    row_count = int((await db_session.execute(count_stmt)).scalar() or 0)
    assert row_count == 1


@pytest.mark.asyncio
async def test_selection_repository_owner_row_summary_and_label_helpers(
    repo: SelectionRepository,
    db_session,
):
    user, gallery, alpha_sharelink, bravo_sharelink, charlie_sharelink = await _create_owner_gallery_sharelinks(db_session)
    alpha_config = await _create_config(db_session, alpha_sharelink, is_enabled=True)
    bravo_config = await _create_config(db_session, bravo_sharelink, is_enabled=True)

    alpha_old = await _create_session(
        db_session,
        alpha_sharelink,
        alpha_config,
        client_name="Alpha Old",
        selected_count=1,
        updated_at=datetime.now(UTC) - timedelta(hours=4),
        created_at=datetime.now(UTC) - timedelta(hours=5),
    )
    alpha_latest = await _create_session(
        db_session,
        alpha_sharelink,
        alpha_config,
        client_name="Alpha Latest",
        status=SelectionSessionStatus.SUBMITTED.value,
        selected_count=2,
        updated_at=datetime.now(UTC) - timedelta(minutes=5),
        created_at=datetime.now(UTC) - timedelta(hours=1),
        submitted_at=datetime.now(UTC) - timedelta(minutes=10),
    )
    bravo_session = await _create_session(
        db_session,
        bravo_sharelink,
        bravo_config,
        client_name="Bravo Closed",
        status=SelectionSessionStatus.CLOSED.value,
        selected_count=1,
        updated_at=datetime.now(UTC) - timedelta(minutes=30),
        created_at=datetime.now(UTC) - timedelta(hours=2),
    )

    alpha_photo_one = await _create_photo(db_session, gallery, "b_frame.jpg")
    alpha_photo_two = await _create_photo(db_session, gallery, "A_frame.jpg")
    bravo_photo = await _create_photo(db_session, gallery, "c_frame.jpg")
    db_session.add_all(
        [
            ShareLinkSelectionItem(
                session_id=alpha_old.id,
                photo_id=alpha_photo_one.id,
                comment="older pick",
                selected_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            ),
            ShareLinkSelectionItem(
                session_id=alpha_latest.id,
                photo_id=alpha_photo_two.id,
                comment="latest pick",
                selected_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            ),
            ShareLinkSelectionItem(
                session_id=bravo_session.id,
                photo_id=bravo_photo.id,
                comment=None,
                selected_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.commit()

    owner_row = await repo.get_owner_selection_row(alpha_sharelink.id, user.id)
    missing_owner_row = await repo.get_owner_selection_row(uuid4(), user.id)
    gallery_rows = await repo.get_gallery_selection_rows(gallery.id, user.id)
    selected_count = await repo.count_selected_for_sharelink(alpha_sharelink.id)
    selected_items = await repo.get_selected_items_for_sharelink(alpha_sharelink.id)
    summary = await repo.get_gallery_selection_summary(gallery.id, user.id)
    label_and_gallery = await repo.get_sharelink_label_and_gallery_name(alpha_sharelink.id, user.id)
    missing_label_and_gallery = await repo.get_sharelink_label_and_gallery_name(uuid4(), user.id)

    assert owner_row is not None
    sharelink_row, latest_session_row, config_row = owner_row
    assert sharelink_row.id == alpha_sharelink.id
    assert latest_session_row is not None and latest_session_row.id == alpha_latest.id
    assert config_row is not None and config_row.id == alpha_config.id
    assert missing_owner_row is None

    assert [row[0].id for row in gallery_rows] == [
        charlie_sharelink.id,
        alpha_sharelink.id,
        bravo_sharelink.id,
    ]
    assert gallery_rows[0][1] is None
    assert gallery_rows[1][1] is not None and gallery_rows[1][1].id == alpha_latest.id

    assert selected_count == 2
    assert selected_items == [
        ("A_frame.jpg", "latest pick"),
        ("b_frame.jpg", "older pick"),
    ]

    assert summary == [
        (alpha_sharelink.id, "Alpha", "submitted", 3),
        (bravo_sharelink.id, "bravo", "closed", 1),
        (charlie_sharelink.id, "Charlie", "not_started", 0),
    ]

    assert label_and_gallery == ("Alpha", "Selection Gallery")
    assert missing_label_and_gallery is None


@pytest.mark.asyncio
async def test_selection_repository_bulk_status_updates_skip_submitted_sessions(
    repo: SelectionRepository,
    db_session,
):
    user, gallery, sharelink, _, _ = await _create_owner_gallery_sharelinks(db_session)
    config = await _create_config(db_session, sharelink, is_enabled=True)

    submitted_at = datetime.now(UTC) - timedelta(minutes=15)
    submitted_session = await _create_session(
        db_session,
        sharelink,
        config,
        client_name="Submitted Client",
        status=SelectionSessionStatus.SUBMITTED.value,
        selected_count=2,
        submitted_at=submitted_at,
    )
    in_progress_session = await _create_session(
        db_session,
        sharelink,
        config,
        client_name="Open Client",
        status=SelectionSessionStatus.IN_PROGRESS.value,
        selected_count=1,
    )

    closed_count = await repo.close_all_for_gallery(gallery.id, user.id)
    assert closed_count == 1

    refreshed_submitted = await repo.get_session_by_id_for_sharelink(sharelink.id, submitted_session.id)
    refreshed_closed = await repo.get_session_by_id_for_sharelink(sharelink.id, in_progress_session.id)
    assert refreshed_submitted is not None
    assert refreshed_submitted.status == SelectionSessionStatus.SUBMITTED.value
    assert refreshed_submitted.submitted_at == submitted_at
    assert refreshed_closed is not None
    assert refreshed_closed.status == SelectionSessionStatus.CLOSED.value

    reopened_count = await repo.reopen_all_for_gallery(gallery.id, user.id)
    assert reopened_count == 1

    reopened_session = await repo.get_session_by_id_for_sharelink(sharelink.id, in_progress_session.id)
    assert reopened_session is not None
    assert reopened_session.status == SelectionSessionStatus.IN_PROGRESS.value
    assert reopened_session.submitted_at is None
