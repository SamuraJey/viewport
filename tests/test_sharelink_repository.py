from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from freezegun.api import FrozenDateTimeFactory

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus, ProjectVisibility
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink, ShareScopeType
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
async def test_get_owner_sharelink_daily_stats_aggregates_owner_links(
    repo: ShareLinkRepository,
    db_session,
):
    user = User(email=f"sharelink-daily-owner-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    other_user = User(email=f"sharelink-daily-other-{uuid4()}@example.com", password_hash="hashed", display_name="other user")
    db_session.add_all([user, other_user])
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Daily Stats Gallery")
    other_gallery = Gallery(owner_id=other_user.id, name="Other Daily Stats Gallery")
    db_session.add_all([gallery, other_gallery])
    await db_session.commit()

    first_sharelink = ShareLink(gallery_id=gallery.id, label="Needle Daily")
    second_sharelink = ShareLink(gallery_id=gallery.id, label="Other Daily")
    other_sharelink = ShareLink(gallery_id=other_gallery.id, label="Hidden Daily")
    db_session.add_all([first_sharelink, second_sharelink, other_sharelink])
    await db_session.commit()

    today = datetime.now(UTC).date()
    db_session.add_all(
        [
            ShareLinkDailyStat(sharelink_id=first_sharelink.id, day=today, views_total=3, views_unique=2, zip_downloads=1, single_downloads=0),
            ShareLinkDailyStat(sharelink_id=second_sharelink.id, day=today, views_total=7, views_unique=4, zip_downloads=0, single_downloads=2),
            ShareLinkDailyStat(sharelink_id=other_sharelink.id, day=today, views_total=99, views_unique=99, zip_downloads=99, single_downloads=99),
        ]
    )
    await db_session.commit()

    rows = await repo.get_owner_sharelink_daily_stats(user.id, days=1)
    searched_rows = await repo.get_owner_sharelink_daily_stats(user.id, days=1, search="Needle")

    assert rows == [(today, 10, 6, 1, 2)]
    assert searched_rows == [(today, 3, 2, 1, 0)]


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
async def test_get_sharelinks_by_owner_orders_latest_activity_before_pagination(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-activity-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Activity Gallery")
    db_session.add(gallery)
    await db_session.commit()

    older_link = ShareLink(
        gallery_id=gallery.id,
        label="Older link update",
        created_at=datetime(2026, 1, 1, 9, 0, 0),
        updated_at=datetime(2026, 1, 4, 9, 0, 0),
    )
    latest_session_link = ShareLink(
        gallery_id=gallery.id,
        label="Latest session activity",
        created_at=datetime(2026, 1, 1, 8, 0, 0),
        updated_at=datetime(2026, 1, 1, 8, 0, 0),
    )
    newest_link_update = ShareLink(
        gallery_id=gallery.id,
        label="Newest link update",
        created_at=datetime(2026, 1, 1, 6, 0, 0),
        updated_at=datetime(2026, 1, 6, 9, 0, 0),
    )
    middle_link = ShareLink(
        gallery_id=gallery.id,
        label="Middle link update",
        created_at=datetime(2026, 1, 1, 7, 0, 0),
        updated_at=datetime(2026, 1, 3, 9, 0, 0),
    )
    db_session.add_all([older_link, latest_session_link, newest_link_update, middle_link])
    await db_session.commit()

    config = ShareLinkSelectionConfig(sharelink_id=latest_session_link.id, is_enabled=True)
    stale_config = ShareLinkSelectionConfig(sharelink_id=newest_link_update.id, is_enabled=True)
    db_session.add_all([config, stale_config])
    await db_session.commit()

    db_session.add_all(
        [
            ShareLinkSelectionSession(
                sharelink_id=latest_session_link.id,
                config_id=config.id,
                client_name="Client",
                status=SelectionSessionStatus.IN_PROGRESS.value,
                resume_token_hash=f"token-{uuid4()}",
                last_activity_at=datetime(2026, 1, 5, 9, 0, 0),
                created_at=datetime(2026, 1, 5, 9, 0, 0),
                updated_at=datetime(2026, 1, 5, 9, 0, 0),
            ),
            ShareLinkSelectionSession(
                sharelink_id=newest_link_update.id,
                config_id=stale_config.id,
                client_name="Earlier Client",
                status=SelectionSessionStatus.IN_PROGRESS.value,
                resume_token_hash=f"token-{uuid4()}",
                last_activity_at=datetime(2026, 1, 2, 9, 0, 0),
                created_at=datetime(2026, 1, 2, 9, 0, 0),
                updated_at=datetime(2026, 1, 2, 9, 0, 0),
            ),
        ]
    )
    await db_session.commit()

    first_page_rows, total, _ = await repo.get_sharelinks_by_owner(user.id, page=1, size=1)
    second_page_rows, _, _ = await repo.get_sharelinks_by_owner(user.id, page=2, size=1)
    third_page_rows, _, _ = await repo.get_sharelinks_by_owner(user.id, page=3, size=1)

    assert total == 4
    assert [row[0].label for row in first_page_rows] == ["Newest link update"]
    assert first_page_rows[0][3] == datetime(2026, 1, 6, 9, 0, 0)
    assert [row[0].label for row in second_page_rows] == ["Latest session activity"]
    assert second_page_rows[0][3] == datetime(2026, 1, 5, 9, 0, 0)
    assert [row[0].label for row in third_page_rows] == ["Older link update"]


@pytest.mark.asyncio
async def test_get_sharelink_for_public_access_hides_deleted_targets(repo: ShareLinkRepository, db_session):
    user = User(email=f"sharelink-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Deleted Gallery")
    project = Project(owner_id=user.id, name="Deleted Project")
    db_session.add_all([gallery, project])
    await db_session.commit()

    gallery_sharelink = ShareLink(gallery_id=gallery.id, scope_type=ShareScopeType.GALLERY.value)
    project_sharelink = ShareLink(project_id=project.id, scope_type=ShareScopeType.PROJECT.value)
    db_session.add_all([gallery_sharelink, project_sharelink])
    await db_session.commit()

    gallery.is_deleted = True
    project.is_deleted = True
    await db_session.commit()

    assert await repo.get_sharelink_for_public_access(gallery_sharelink.id) is None
    assert await repo.get_sharelink_for_public_access(project_sharelink.id) is None


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
async def test_get_sharelinks_by_owner_treats_expiry_boundary_as_expired(
    repo: ShareLinkRepository,
    db_session,
    freezer: FrozenDateTimeFactory,
):
    now = datetime(2026, 4, 17, 10, 0, 0, tzinfo=UTC)
    freezer.move_to(now)

    user = User(email=f"sharelink-boundary-{uuid4()}@example.com", password_hash="hashed", display_name="sharelink user")
    db_session.add(user)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, name="Boundary Gallery")
    db_session.add(gallery)
    await db_session.commit()

    boundary_expired_sharelink = ShareLink(
        gallery_id=gallery.id,
        label="BoundaryExpired",
        expires_at=now.replace(tzinfo=None),
        is_active=True,
    )
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


@pytest.mark.asyncio
async def test_sharelink_repository_lookup_and_photo_scope_helpers(repo: ShareLinkRepository, db_session):
    user = User(email=f"lookup-{uuid4()}@example.com", password_hash="hashed", display_name="Lookup user")
    db_session.add(user)
    await db_session.commit()

    project = Project(owner_id=user.id, name="Lookup Project")
    gallery = Gallery(owner_id=user.id, project=project, name="Lookup Gallery")
    db_session.add_all([project, gallery])
    await db_session.commit()

    active_sharelink = ShareLink(
        gallery_id=gallery.id,
        label="Active",
        is_active=True,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
    )
    inactive_sharelink = ShareLink(gallery_id=gallery.id, label="Inactive", is_active=False)
    expired_sharelink = ShareLink(
        gallery_id=gallery.id,
        label="Expired",
        is_active=True,
        expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
    )
    project_sharelink = ShareLink(
        project_id=project.id,
        scope_type=ShareScopeType.PROJECT.value,
        label="Project",
    )
    db_session.add_all([active_sharelink, inactive_sharelink, expired_sharelink, project_sharelink])
    await db_session.commit()

    photo = Photo(
        gallery_id=gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{gallery.id}/lookup.jpg",
        display_name="lookup.jpg",
        thumbnail_object_key=f"{gallery.id}/thumb-lookup.jpg",
        file_size=1024,
    )
    db_session.add(photo)
    await db_session.commit()

    fetched_sharelink = await repo.get_sharelink_by_id(active_sharelink.id)
    assert fetched_sharelink is not None
    assert fetched_sharelink.id == active_sharelink.id
    assert repo._is_expired(expired_sharelink) is True
    assert repo._is_expired(active_sharelink) is False

    assert await repo.get_valid_sharelink(uuid4()) is None
    assert await repo.get_valid_sharelink(inactive_sharelink.id) is None
    assert await repo.get_valid_sharelink(expired_sharelink.id) is None
    valid_sharelink = await repo.get_valid_sharelink(active_sharelink.id)
    assert valid_sharelink is not None
    assert valid_sharelink.id == active_sharelink.id

    owner_row = await repo.get_sharelink_for_owner(project_sharelink.id, user.id)
    missing_owner_row = await repo.get_sharelink_for_owner(uuid4(), user.id)
    assert owner_row is not None
    assert owner_row[0].id == project_sharelink.id
    assert missing_owner_row is None

    found_photo = await repo.get_photo_by_id_and_gallery(photo.id, gallery.id)
    missing_photo = await repo.get_photo_by_id_and_gallery(uuid4(), gallery.id)
    assert found_photo is not None
    assert found_photo.id == photo.id
    assert missing_photo is None

    assert await repo.get_photos_by_ids_and_gallery(gallery.id, []) == []
    photos = await repo.get_photos_by_ids_and_gallery(gallery.id, [photo.id, uuid4()])
    assert [item.id for item in photos] == [photo.id]

    assert await repo.get_photos_by_ids_and_project(project.id, []) == []
    project_photos = await repo.get_photos_by_ids_and_project(project.id, [photo.id, uuid4()])
    assert [item.id for item in project_photos] == [photo.id]


@pytest.mark.asyncio
async def test_get_owner_sharelink_cover_thumbnail_keys_prefers_covers_and_project_order(
    repo: ShareLinkRepository,
    db_session,
):
    user = User(
        email=f"sharelink-thumbs-{uuid4()}@example.com",
        password_hash="hashed",
        display_name="Thumb user",
    )
    db_session.add(user)
    await db_session.commit()

    project = Project(owner_id=user.id, name="Thumb Project")
    db_session.add(project)
    await db_session.commit()

    gallery = Gallery(owner_id=user.id, project=project, name="Gallery Link", project_position=2)
    hidden_first_gallery = Gallery(
        owner_id=user.id,
        project=project,
        name="Direct Only First",
        project_position=0,
        project_visibility=ProjectVisibility.DIRECT_ONLY.value,
    )
    project_first_gallery = Gallery(
        owner_id=user.id,
        project=project,
        name="Project First",
        project_position=1,
    )
    db_session.add_all([gallery, hidden_first_gallery, project_first_gallery])
    await db_session.commit()

    gallery_fallback_photo = Photo(
        gallery_id=gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{gallery.id}/fallback.jpg",
        display_name="fallback.jpg",
        thumbnail_object_key="gallery-fallback-thumb",
        file_size=1024,
        uploaded_at=datetime(2026, 1, 1),
    )
    gallery_cover_photo = Photo(
        gallery_id=gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{gallery.id}/cover.jpg",
        display_name="cover.jpg",
        thumbnail_object_key="gallery-cover-thumb",
        file_size=1024,
        uploaded_at=datetime(2025, 1, 1),
    )
    project_first_photo = Photo(
        gallery_id=project_first_gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{project_first_gallery.id}/project-first.jpg",
        display_name="project-first.jpg",
        thumbnail_object_key="project-first-thumb",
        file_size=1024,
        uploaded_at=datetime(2024, 1, 1),
    )
    hidden_first_photo = Photo(
        gallery_id=hidden_first_gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{hidden_first_gallery.id}/hidden-first.jpg",
        display_name="hidden-first.jpg",
        thumbnail_object_key="hidden-project-thumb",
        file_size=1024,
        uploaded_at=datetime(2026, 1, 1),
    )
    db_session.add_all(
        [
            gallery_fallback_photo,
            gallery_cover_photo,
            project_first_photo,
            hidden_first_photo,
        ]
    )
    await db_session.commit()

    gallery.cover_photo_id = gallery_cover_photo.id
    gallery_sharelink = ShareLink(gallery_id=gallery.id)
    project_sharelink = ShareLink(
        project_id=project.id,
        scope_type=ShareScopeType.PROJECT.value,
    )
    db_session.add_all([gallery_sharelink, project_sharelink])
    await db_session.commit()

    thumbnail_keys = await repo.get_owner_sharelink_cover_thumbnail_keys(
        [gallery_sharelink.id, project_sharelink.id, uuid4()],
        user.id,
    )

    assert thumbnail_keys[gallery_sharelink.id] == "gallery-cover-thumb"
    assert thumbnail_keys[project_sharelink.id] == "project-first-thumb"


@pytest.mark.asyncio
async def test_get_photo_total_size_by_gallery_excludes_deleted_galleries(repo: ShareLinkRepository, db_session):
    user = User(email=f"gallery-size-{uuid4()}@example.com", password_hash="hashed", display_name="Size user")
    db_session.add(user)
    await db_session.commit()

    active_gallery = Gallery(owner_id=user.id, name="Active Size Gallery")
    deleted_gallery = Gallery(owner_id=user.id, name="Deleted Size Gallery", is_deleted=True)
    db_session.add_all([active_gallery, deleted_gallery])
    await db_session.commit()

    db_session.add_all(
        [
            Photo(
                gallery_id=active_gallery.id,
                status=PhotoUploadStatus.SUCCESSFUL,
                object_key=f"{active_gallery.id}/first.jpg",
                display_name="first.jpg",
                thumbnail_object_key=f"{active_gallery.id}/thumb-first.jpg",
                file_size=1234,
            ),
            Photo(
                gallery_id=active_gallery.id,
                status=PhotoUploadStatus.SUCCESSFUL,
                object_key=f"{active_gallery.id}/second.jpg",
                display_name="second.jpg",
                thumbnail_object_key=f"{active_gallery.id}/thumb-second.jpg",
                file_size=4321,
            ),
            Photo(
                gallery_id=deleted_gallery.id,
                status=PhotoUploadStatus.SUCCESSFUL,
                object_key=f"{deleted_gallery.id}/hidden.jpg",
                display_name="hidden.jpg",
                thumbnail_object_key=f"{deleted_gallery.id}/thumb-hidden.jpg",
                file_size=9999,
            ),
        ]
    )
    await db_session.commit()

    active_stats = await repo.get_photo_stats_by_gallery(active_gallery.id)
    deleted_stats = await repo.get_photo_stats_by_gallery(deleted_gallery.id)

    assert active_stats.photo_count == 2
    assert active_stats.total_size_bytes == 5555
    assert deleted_stats.photo_count == 0
    assert deleted_stats.total_size_bytes == 0
    assert await repo.get_photo_total_size_by_gallery(active_gallery.id) == 5555
    assert await repo.get_photo_total_size_by_gallery(deleted_gallery.id) == 0


@pytest.mark.asyncio
async def test_get_photos_by_visible_project_excludes_hidden_galleries(repo: ShareLinkRepository, db_session):
    user = User(email=f"visible-project-{uuid4()}@example.com", password_hash="hashed", display_name="Visible project user")
    db_session.add(user)
    await db_session.commit()

    project = Project(owner_id=user.id, name="Visible Project")
    listed_gallery = Gallery(owner_id=user.id, project=project, name="Listed", project_visibility=ProjectVisibility.LISTED.value, project_position=0)
    hidden_gallery = Gallery(owner_id=user.id, project=project, name="Hidden", project_visibility=ProjectVisibility.DIRECT_ONLY.value, project_position=1)
    db_session.add_all([project, listed_gallery, hidden_gallery])
    await db_session.commit()

    listed_photo = Photo(
        gallery_id=listed_gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{listed_gallery.id}/listed.jpg",
        display_name="listed.jpg",
        thumbnail_object_key=f"{listed_gallery.id}/listed-thumb.jpg",
        file_size=1024,
    )
    hidden_photo = Photo(
        gallery_id=hidden_gallery.id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{hidden_gallery.id}/hidden.jpg",
        display_name="hidden.jpg",
        thumbnail_object_key=f"{hidden_gallery.id}/hidden-thumb.jpg",
        file_size=1024,
    )
    db_session.add_all([listed_photo, hidden_photo])
    await db_session.commit()

    photos_by_gallery = await repo.get_photos_by_visible_project(project.id)

    assert list(photos_by_gallery.keys()) == [listed_gallery.id]
    assert [photo.id for photo in photos_by_gallery[listed_gallery.id]] == [listed_photo.id]
