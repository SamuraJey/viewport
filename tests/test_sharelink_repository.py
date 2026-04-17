from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio

from viewport.models.gallery import Gallery
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_analytics import ShareLinkDailyStat
from viewport.models.sharelink_selection import SelectionSessionStatus, ShareLinkSelectionConfig, ShareLinkSelectionSession
from viewport.models.user import User
from viewport.repositories.selection_repository import SelectionRepository
from viewport.repositories.sharelink_repository import ShareLinkRepository


class _InsertResult:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount


@pytest_asyncio.fixture
async def repo(db_session) -> ShareLinkRepository:
    return ShareLinkRepository(db_session)


@pytest.mark.asyncio
async def test_record_view_without_identity_does_not_increment_unique_views():
    db = AsyncMock()
    repo = ShareLinkRepository(db)
    repo._upsert_daily_stat = AsyncMock()

    sharelink_id = uuid4()
    await repo.record_view(sharelink_id, ip_address=None, user_agent=None)

    repo._upsert_daily_stat.assert_awaited_once()
    assert repo._upsert_daily_stat.await_args.kwargs["views_unique_inc"] == 0


@pytest.mark.asyncio
async def test_record_view_with_new_identity_increments_unique_views():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_InsertResult(1), None])
    repo = ShareLinkRepository(db)
    repo._upsert_daily_stat = AsyncMock()

    sharelink_id = uuid4()
    await repo.record_view(sharelink_id, ip_address="203.0.113.7", user_agent="pytest")

    repo._upsert_daily_stat.assert_awaited_once()
    assert repo._upsert_daily_stat.await_args.kwargs["views_unique_inc"] == 1


@pytest.mark.asyncio
async def test_record_single_download_creates_and_updates_daily_stats(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Analytics Gallery")
    db_session.add(gallery)
    await db_session.commit()

    sharelink = ShareLink(gallery_id=gallery.id)
    db_session.add(sharelink)
    await db_session.commit()

    sharelink_id = sharelink.id

    today = datetime.now(UTC).date()

    await repo.record_single_download(sharelink_id)

    fetched_sharelink = await db_session.get(ShareLink, sharelink_id)
    assert fetched_sharelink is not None
    assert fetched_sharelink.single_downloads == 1

    stat_row = await db_session.get(ShareLinkDailyStat, (sharelink_id, today))
    assert stat_row is not None
    assert stat_row.single_downloads == 1
    assert stat_row.views_total == 0
    assert stat_row.views_unique == 0
    assert stat_row.zip_downloads == 0

    await repo.record_single_download(sharelink_id)

    db_session.expire_all()
    fetched_sharelink = await db_session.get(ShareLink, sharelink_id)
    assert fetched_sharelink is not None
    assert fetched_sharelink.single_downloads == 2

    stat_row = await db_session.get(ShareLinkDailyStat, (sharelink_id, today))
    assert stat_row is not None
    assert stat_row.single_downloads == 2
    assert stat_row.views_total == 0
    assert stat_row.views_unique == 0
    assert stat_row.zip_downloads == 0


@pytest.mark.asyncio
async def test_record_zip_download_creates_and_updates_daily_stats(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Zip Analytics Gallery")
    db_session.add(gallery)
    await db_session.commit()

    sharelink = ShareLink(gallery_id=gallery.id)
    db_session.add(sharelink)
    await db_session.commit()

    sharelink_id = sharelink.id
    today = datetime.now(UTC).date()

    await repo.record_zip_download(sharelink_id)

    fetched_sharelink = await db_session.get(ShareLink, sharelink_id)
    assert fetched_sharelink is not None
    assert fetched_sharelink.zip_downloads == 1

    stat_row = await db_session.get(ShareLinkDailyStat, (sharelink_id, today))
    assert stat_row is not None
    assert stat_row.zip_downloads == 1
    assert stat_row.views_total == 0
    assert stat_row.views_unique == 0
    assert stat_row.single_downloads == 0

    await repo.record_zip_download(sharelink_id)

    db_session.expire_all()
    fetched_sharelink = await db_session.get(ShareLink, sharelink_id)
    assert fetched_sharelink is not None
    assert fetched_sharelink.zip_downloads == 2

    stat_row = await db_session.get(ShareLinkDailyStat, (sharelink_id, today))
    assert stat_row is not None
    assert stat_row.zip_downloads == 2
    assert stat_row.views_total == 0
    assert stat_row.views_unique == 0
    assert stat_row.single_downloads == 0


@pytest.mark.asyncio
async def test_get_sharelink_daily_stats_returns_requested_range_in_ascending_order(
    repo: ShareLinkRepository,
    db_session,
):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Daily Stats Gallery")
    db_session.add(gallery)
    await db_session.commit()

    sharelink = ShareLink(gallery_id=gallery.id)
    db_session.add(sharelink)
    await db_session.commit()

    sharelink_id = sharelink.id
    today = datetime.now(UTC).date()
    older_day = today - timedelta(days=3)
    first_day = today - timedelta(days=2)
    second_day = today - timedelta(days=1)

    db_session.add_all(
        [
            ShareLinkDailyStat(sharelink_id=sharelink_id, day=older_day, views_total=99, views_unique=9, zip_downloads=9, single_downloads=9),
            ShareLinkDailyStat(sharelink_id=sharelink_id, day=first_day, views_total=1, views_unique=2, zip_downloads=3, single_downloads=4),
            ShareLinkDailyStat(sharelink_id=sharelink_id, day=second_day, views_total=5, views_unique=6, zip_downloads=7, single_downloads=8),
            ShareLinkDailyStat(sharelink_id=sharelink_id, day=today, views_total=10, views_unique=11, zip_downloads=12, single_downloads=13),
        ]
    )
    await db_session.commit()

    rows = await repo.get_sharelink_daily_stats(sharelink_id, days=3)

    assert [row.day for row in rows] == [first_day, second_day, today]
    assert [row.views_total for row in rows] == [1, 5, 10]
    assert [row.zip_downloads for row in rows] == [3, 7, 12]
    assert [row.single_downloads for row in rows] == [4, 8, 13]


@pytest.mark.asyncio
async def test_get_sharelinks_by_owner_counts_active_links_using_naive_utc_now(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Summary Gallery")
    db_session.add(gallery)
    await db_session.commit()

    now = datetime.now(UTC).replace(tzinfo=None)
    active_sharelink = ShareLink(gallery_id=gallery.id, expires_at=now + timedelta(days=1), is_active=True)
    expired_sharelink = ShareLink(gallery_id=gallery.id, expires_at=now - timedelta(days=1), is_active=True)
    db_session.add_all([active_sharelink, expired_sharelink])
    await db_session.commit()

    rows, total, summary = await repo.get_sharelinks_by_owner(user.id, page=1, size=10)

    assert total == 2
    assert len(rows) == 2
    assert summary["active_links"] == 1
    assert summary["views"] == 0
    assert summary["zip_downloads"] == 0
    assert summary["single_downloads"] == 0


@pytest.mark.asyncio
async def test_get_sharelinks_by_owner_filters_by_status(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Status Gallery")
    db_session.add(gallery)
    await db_session.commit()

    now = datetime.now(UTC).replace(tzinfo=None)
    active_sharelink = ShareLink(gallery_id=gallery.id, label="Active", expires_at=now + timedelta(days=1), is_active=True)
    inactive_sharelink = ShareLink(gallery_id=gallery.id, label="Inactive", expires_at=now + timedelta(days=1), is_active=False)
    expired_sharelink = ShareLink(gallery_id=gallery.id, label="Expired", expires_at=now - timedelta(days=1), is_active=True)
    db_session.add_all([active_sharelink, inactive_sharelink, expired_sharelink])
    await db_session.commit()

    active_rows, active_total, active_summary = await repo.get_sharelinks_by_owner(user.id, page=1, size=10, status="active")
    inactive_rows, inactive_total, _ = await repo.get_sharelinks_by_owner(user.id, page=1, size=10, status="inactive")
    expired_rows, expired_total, _ = await repo.get_sharelinks_by_owner(user.id, page=1, size=10, status="expired")

    assert active_total == 1
    assert [row[0].label for row in active_rows] == ["Active"]
    assert active_summary["active_links"] == 1

    assert inactive_total == 1
    assert [row[0].label for row in inactive_rows] == ["Inactive"]

    assert expired_total == 1
    assert [row[0].label for row in expired_rows] == ["Expired"]


@pytest.mark.asyncio
async def test_get_sharelinks_by_owner_treats_expiry_boundary_as_expired(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-boundary-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Boundary Gallery")
    db_session.add(gallery)
    await db_session.commit()

    now = datetime.now(UTC).replace(tzinfo=None)
    boundary_expired_sharelink = ShareLink(gallery_id=gallery.id, label="BoundaryExpired", expires_at=now, is_active=True)
    db_session.add(boundary_expired_sharelink)
    await db_session.commit()

    _, active_total, _ = await repo.get_sharelinks_by_owner(user.id, page=1, size=10, status="active")
    _, expired_total, _ = await repo.get_sharelinks_by_owner(user.id, page=1, size=10, status="expired")

    assert active_total == 0
    assert expired_total == 1


@pytest.mark.asyncio
async def test_get_sharelink_selection_summaries_is_bounded_to_requested_ids(db_session):
    user = User(email=f"selection-{uuid4()}@example.com", password_hash="hashed", display_name="selection user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Selection Summary Gallery")
    db_session.add(gallery)
    await db_session.commit()

    first_link = ShareLink(gallery_id=gallery.id, label="First")
    second_link = ShareLink(gallery_id=gallery.id, label="Second")
    db_session.add_all([first_link, second_link])
    await db_session.commit()

    first_config = ShareLinkSelectionConfig(sharelink_id=first_link.id, is_enabled=True)
    second_config = ShareLinkSelectionConfig(sharelink_id=second_link.id, is_enabled=True)
    db_session.add_all([first_config, second_config])
    await db_session.commit()

    db_session.add_all(
        [
            ShareLinkSelectionSession(
                sharelink_id=first_link.id,
                config_id=first_config.id,
                client_name="Client A",
                status=SelectionSessionStatus.IN_PROGRESS.value,
                selected_count=3,
                resume_token_hash="hash-a",
            ),
            ShareLinkSelectionSession(
                sharelink_id=second_link.id,
                config_id=second_config.id,
                client_name="Client B",
                status=SelectionSessionStatus.SUBMITTED.value,
                selected_count=5,
                resume_token_hash="hash-b",
            ),
        ]
    )
    await db_session.commit()

    selection_repo = SelectionRepository(db_session)
    summaries = await selection_repo.get_sharelink_selection_summaries([first_link.id])

    assert set(summaries.keys()) == {first_link.id}
    assert summaries[first_link.id][0] is True
    assert summaries[first_link.id][3] == 1
    assert summaries[first_link.id][5] == 3
