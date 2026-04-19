import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus, ProjectVisibility
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_analytics import ShareLinkDailyStat, ShareLinkDailyVisitor
from viewport.models.sharelink_selection import ShareLinkSelectionConfig, ShareLinkSelectionSession
from viewport.models.user import User
from viewport.repositories.project_repository import ProjectRepository
from viewport.schemas.gallery import GalleryPhotoSortBy, SortOrder


@pytest_asyncio.fixture
async def repo(db_session) -> ProjectRepository:
    return ProjectRepository(db_session)


async def _create_user(db_session, email_prefix: str = "project-repo") -> User:
    user = User(
        email=f"{email_prefix}-{uuid.uuid4()}@example.com",
        password_hash="hashed",
        display_name="Project Repository User",
    )
    db_session.add(user)
    await db_session.commit()
    return user


async def _create_project_gallery(
    db_session,
    owner_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    name: str,
    position: int,
    visibility: ProjectVisibility = ProjectVisibility.LISTED,
) -> Gallery:
    gallery = Gallery(
        owner_id=owner_id,
        project_id=project_id,
        name=name,
        project_position=position,
        project_visibility=visibility.value,
        public_sort_by=GalleryPhotoSortBy.ORIGINAL_FILENAME.value,
        public_sort_order=SortOrder.ASC.value,
        shooting_date=date(2026, 4, 19),
    )
    db_session.add(gallery)
    await db_session.commit()
    await db_session.refresh(gallery)
    return gallery


async def _create_photo(
    db_session,
    gallery_id: uuid.UUID,
    *,
    display_name: str,
    thumbnail_object_key: str,
    file_size: int,
    uploaded_at: datetime,
) -> Photo:
    photo = Photo(
        gallery_id=gallery_id,
        status=PhotoUploadStatus.SUCCESSFUL,
        object_key=f"{gallery_id}/{display_name}",
        display_name=display_name,
        thumbnail_object_key=thumbnail_object_key,
        file_size=file_size,
        uploaded_at=uploaded_at,
    )
    db_session.add(photo)
    await db_session.commit()
    await db_session.refresh(photo)
    return photo


@pytest.mark.asyncio
async def test_escape_like_term_escapes_special_characters():
    escaped = ProjectRepository._escape_like_term(r"100%_gallery\name")

    assert escaped == r"100\%\_gallery\\name"


@pytest.mark.asyncio
async def test_create_project_with_initial_gallery_rolls_back_when_flush_fails():
    db = AsyncMock()
    db.add = Mock()
    db.flush = AsyncMock(side_effect=RuntimeError("flush failed"))
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    db.in_transaction = Mock(return_value=False)
    repo = ProjectRepository(db)

    with pytest.raises(RuntimeError, match="flush failed"):
        await repo.create_project_with_initial_gallery(uuid.uuid4(), "Broken Project")

    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_project_repository_search_update_and_delete_branches(repo: ProjectRepository, db_session):
    user = await _create_user(db_session)

    percent_project = await repo.create_project(user.id, "Delivery 100%")
    underscore_project = await repo.create_project(user.id, "Frame_01")

    percent_results, percent_total = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        search="100%",
    )
    underscore_results, underscore_total = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        search="Frame_",
    )

    assert percent_total == 1
    assert [project.id for project in percent_results] == [percent_project.id]
    assert underscore_total == 1
    assert [project.id for project in underscore_results] == [underscore_project.id]

    assert await repo.update_project(uuid.uuid4(), user.id, name="Missing") is None

    unchanged = await repo.update_project(percent_project.id, user.id)
    assert unchanged is not None
    assert unchanged.name == "Delivery 100%"

    updated = await repo.update_project(
        percent_project.id,
        user.id,
        name="Delivery Final",
        shooting_date=date(2026, 4, 20),
    )
    assert updated is not None
    assert updated.name == "Delivery Final"
    assert updated.shooting_date == date(2026, 4, 20)

    assert await repo.delete_project(uuid.uuid4(), user.id) is None

    non_empty_project, _ = await repo.create_project_with_initial_gallery(user.id, "Non Empty")
    deleted_gallery_ids = await repo.delete_project(non_empty_project.id, user.id)
    assert deleted_gallery_ids is not None
    assert len(deleted_gallery_ids) == 1
    assert await repo.get_project_by_id_and_owner(non_empty_project.id, user.id) is None

    empty_project = await repo.create_project(user.id, "Empty")
    assert await repo.delete_project(empty_project.id, user.id) == []
    assert await repo.get_project_by_id_and_owner(empty_project.id, user.id) is None


@pytest.mark.asyncio
async def test_project_repository_listed_only_helpers(repo: ProjectRepository, db_session):
    user = await _create_user(db_session, "project-listed")
    project = await repo.create_project(user.id, "Listed Only")

    hidden_gallery = await _create_project_gallery(
        db_session,
        user.id,
        project.id,
        name="Hidden",
        position=0,
        visibility=ProjectVisibility.DIRECT_ONLY,
    )
    listed_gallery = await _create_project_gallery(
        db_session,
        user.id,
        project.id,
        name="Listed",
        position=1,
    )

    hidden_uploaded_at = datetime(2026, 4, 19, 10, 0, tzinfo=UTC)
    listed_uploaded_at = datetime(2026, 4, 19, 11, 0, tzinfo=UTC)
    await _create_photo(
        db_session,
        hidden_gallery.id,
        display_name="hidden.jpg",
        thumbnail_object_key="hidden-thumb",
        file_size=300,
        uploaded_at=hidden_uploaded_at,
    )
    await _create_photo(
        db_session,
        listed_gallery.id,
        display_name="listed.jpg",
        thumbnail_object_key="listed-thumb",
        file_size=120,
        uploaded_at=listed_uploaded_at,
    )

    visible_entry = await repo.get_project_entry_gallery(project.id, owner_id=user.id, listed_only=True)
    total_photo_count = await repo.get_project_total_photo_count(project.id, listed_only=True)
    total_size = await repo.get_project_total_size(project.id, listed_only=True)
    recent_keys = await repo.get_recent_project_thumbnail_keys(project.id, listed_only=True, limit=1)
    visible_folders = await repo.get_visible_project_folders(project.id, limit=1)

    assert visible_entry is not None
    assert visible_entry.id == listed_gallery.id
    assert total_photo_count == 1
    assert total_size == 120
    assert recent_keys == ["listed-thumb"]
    assert [gallery.id for gallery in visible_folders] == [listed_gallery.id]


@pytest.mark.asyncio
async def test_project_repository_project_sharelink_branches(repo: ProjectRepository, db_session):
    user = await _create_user(db_session, "project-share")
    project = await repo.create_project(user.id, "Sharelinks")
    sharelink = await repo.create_project_sharelink(
        project.id,
        expires_at=datetime.now(UTC) + timedelta(days=3),
        label="Original Label",
    )

    assert (
        await repo.update_project_sharelink(
            sharelink.id,
            uuid.uuid4(),
            user.id,
            fields_set={"label"},
            label="Missing Project",
        )
        is None
    )

    assert (
        await repo.update_project_sharelink(
            uuid.uuid4(),
            project.id,
            user.id,
            fields_set={"label"},
            label="Missing Sharelink",
        )
        is None
    )

    updated = await repo.update_project_sharelink(
        sharelink.id,
        project.id,
        user.id,
        fields_set={"label", "expires_at"},
        label="Updated Label",
        expires_at=datetime(2026, 5, 1, 12, 0, 0),
    )
    assert updated is not None
    assert updated.label == "Updated Label"
    assert updated.expires_at == datetime(2026, 5, 1, 12, 0, 0)

    with pytest.raises(ValueError, match="is_active cannot be null"):
        await repo.update_project_sharelink(
            sharelink.id,
            project.id,
            user.id,
            fields_set={"is_active"},
            is_active=None,
        )

    assert await repo.delete_project_sharelink(sharelink.id, uuid.uuid4(), user.id) is False
    assert await repo.delete_project_sharelink(uuid.uuid4(), project.id, user.id) is False
    assert await repo.delete_project_sharelink(sharelink.id, project.id, user.id) is True


@pytest.mark.asyncio
async def test_project_repository_batch_enrichment_helpers(repo: ProjectRepository, db_session):
    user = await _create_user(db_session, "project-batch")
    first_project = await repo.create_project(user.id, "Batch One")
    second_project = await repo.create_project(user.id, "Batch Two")

    first_gallery = await _create_project_gallery(
        db_session,
        user.id,
        first_project.id,
        name="Alpha",
        position=0,
    )
    second_gallery = await _create_project_gallery(
        db_session,
        user.id,
        first_project.id,
        name="Beta",
        position=1,
    )
    third_gallery = await _create_project_gallery(
        db_session,
        user.id,
        second_project.id,
        name="Gamma",
        position=0,
    )

    await _create_photo(
        db_session,
        first_gallery.id,
        display_name="alpha.jpg",
        thumbnail_object_key="alpha-thumb",
        file_size=100,
        uploaded_at=datetime(2026, 4, 19, 9, 0, tzinfo=UTC),
    )
    await _create_photo(
        db_session,
        second_gallery.id,
        display_name="beta.jpg",
        thumbnail_object_key="beta-thumb",
        file_size=120,
        uploaded_at=datetime(2026, 4, 19, 10, 0, tzinfo=UTC),
    )
    await _create_photo(
        db_session,
        third_gallery.id,
        display_name="gamma.jpg",
        thumbnail_object_key="gamma-thumb",
        file_size=140,
        uploaded_at=datetime(2026, 4, 19, 11, 0, tzinfo=UTC),
    )

    sharelink = await repo.create_project_sharelink(
        first_project.id,
        expires_at=datetime.now(UTC) + timedelta(days=1),
        label="Batch share",
    )

    project_galleries = await repo.get_project_folders_for_projects([first_project.id, second_project.id])
    active_share_project_ids = await repo.get_active_share_project_ids([first_project.id, second_project.id])
    recent_keys = await repo.get_recent_project_thumbnail_keys_by_project_ids(
        [first_project.id, second_project.id],
        limit=2,
    )

    grouped_gallery_ids = {}
    for gallery in project_galleries:
        grouped_gallery_ids.setdefault(gallery.project_id, []).append(gallery.id)

    assert grouped_gallery_ids == {
        first_project.id: [first_gallery.id, second_gallery.id],
        second_project.id: [third_gallery.id],
    }
    assert active_share_project_ids == {first_project.id}
    assert sharelink.project_id == first_project.id
    assert recent_keys[first_project.id] == ["alpha-thumb", "beta-thumb"]
    assert recent_keys[second_project.id] == ["gamma-thumb"]


@pytest.mark.asyncio
async def test_delete_project_removes_project_sharelinks_and_cascaded_selection_analytics(repo: ProjectRepository, db_session):
    user = await _create_user(db_session, "project-delete-cascade")
    project, gallery = await repo.create_project_with_initial_gallery(user.id, "Delete Cascade")
    sharelink = await repo.create_project_sharelink(
        project.id,
        expires_at=datetime.now(UTC) + timedelta(days=1),
        label="Cascade share",
    )

    selection_config = ShareLinkSelectionConfig(sharelink_id=sharelink.id, is_enabled=True)
    db_session.add(selection_config)
    await db_session.commit()
    await db_session.refresh(selection_config)

    selection_session = ShareLinkSelectionSession(
        sharelink_id=sharelink.id,
        config_id=selection_config.id,
        client_name="Client",
        resume_token_hash="resume-token-hash",
    )
    analytics_row = ShareLinkDailyStat(
        sharelink_id=sharelink.id,
        day=datetime.now(UTC).date(),
        views_total=3,
        views_unique=2,
    )
    visitor_row = ShareLinkDailyVisitor(
        sharelink_id=sharelink.id,
        day=datetime.now(UTC).date(),
        visitor_hash="visitor-hash",
    )
    db_session.add_all([selection_session, analytics_row, visitor_row])
    await db_session.commit()
    selection_config_id = selection_config.id
    selection_session_id = selection_session.id
    analytics_day = analytics_row.day
    visitor_day = visitor_row.day
    visitor_hash = visitor_row.visitor_hash

    deleted_gallery_ids = await repo.delete_project(project.id, user.id)

    assert deleted_gallery_ids == [gallery.id]
    db_session.expire_all()
    assert await db_session.get(ShareLink, sharelink.id) is None
    assert await db_session.get(ShareLinkSelectionConfig, selection_config_id) is None
    assert await db_session.get(ShareLinkSelectionSession, selection_session_id) is None
    assert await db_session.get(ShareLinkDailyStat, (sharelink.id, analytics_day)) is None
    assert await db_session.get(ShareLinkDailyVisitor, (sharelink.id, visitor_day, visitor_hash)) is None
