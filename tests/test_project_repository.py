import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus, ProjectVisibility
from viewport.models.project import Project
from viewport.models.sharelink import ShareLink
from viewport.models.sharelink_analytics import ShareLinkDailyStat, ShareLinkDailyVisitor
from viewport.models.sharelink_selection import ShareLinkSelectionConfig, ShareLinkSelectionSession
from viewport.models.user import User
from viewport.repositories.project_repository import ProjectRepository
from viewport.schemas.gallery import CoverDisplayOption, GalleryPhotoSortBy, PhotoSpacing, PublicColorScheme, SortOrder
from viewport.schemas.project import ProjectListSortBy


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
    status: PhotoUploadStatus = PhotoUploadStatus.SUCCESSFUL,
) -> Photo:
    photo = Photo(
        gallery_id=gallery_id,
        status=status,
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
    repo._next_manual_order = AsyncMock(return_value=-1)

    with pytest.raises(RuntimeError, match="flush failed"):
        await repo.create_project_with_initial_gallery(uuid.uuid4(), "Broken Project")

    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_next_manual_order_locks_owner_before_reading_minimum():
    owner_id = uuid.uuid4()
    lock_result = Mock()
    order_result = Mock()
    order_result.scalar_one.return_value = -4
    db = AsyncMock()
    db.execute.side_effect = [lock_result, order_result]
    repo = ProjectRepository(db)

    result = await repo._next_manual_order(owner_id)

    assert result == -4
    assert db.execute.await_count == 2
    lock_statement = str(db.execute.await_args_list[0].args[0])
    assert "FROM users" in lock_statement
    assert "FOR UPDATE" in lock_statement


@pytest.mark.asyncio
async def test_project_share_summaries_map_aggregated_rows():
    project_id = uuid.uuid4()
    share_link_id = uuid.uuid4()
    activity_at = datetime(2026, 7, 23, 12, 0, tzinfo=UTC)
    execute_result = Mock()
    execute_result.all.return_value = [
        (project_id, 3, share_link_id, activity_at),
    ]
    db = AsyncMock()
    db.execute.return_value = execute_result
    db.in_transaction = Mock(return_value=False)
    repo = ProjectRepository(db)

    summaries = await repo.get_project_share_summaries([project_id])

    assert summaries == {
        project_id: (3, share_link_id, activity_at),
    }


@pytest.mark.asyncio
async def test_reorder_projects_replaces_only_requested_positions_and_normalizes_order():
    owner_id = uuid.uuid4()
    projects = [Project(id=uuid.uuid4(), owner_id=owner_id, name=f"Project {index}", manual_order=index) for index in range(4)]
    scalar_result = Mock()
    scalar_result.all.return_value = projects
    execute_result = Mock()
    execute_result.scalars.return_value = scalar_result
    db = AsyncMock()
    db.execute.return_value = execute_result
    repo = ProjectRepository(db)

    await repo.reorder_projects(owner_id, [projects[2].id, projects[1].id])

    assert [project.manual_order for project in projects] == [0, 2, 1, 3]
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_reorder_projects_rejects_unowned_ids_before_commit():
    owner_id = uuid.uuid4()
    project = Project(id=uuid.uuid4(), owner_id=owner_id, name="Owned", manual_order=0)
    scalar_result = Mock()
    scalar_result.all.return_value = [project]
    execute_result = Mock()
    execute_result.scalars.return_value = scalar_result
    db = AsyncMock()
    db.execute.return_value = execute_result
    repo = ProjectRepository(db)

    with pytest.raises(ValueError, match="missing or unowned"):
        await repo.reorder_projects(owner_id, [uuid.uuid4()])

    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_compatibility_project_for_gallery_rolls_back_when_commit_fails(
    repo: ProjectRepository,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = await _create_user(db_session, "project-compat")
    source_project, gallery = await repo.create_project_with_initial_gallery(user.id, "Source Project")
    owner_id = user.id
    source_project_id = source_project.id
    gallery_id = gallery.id

    original_commit = db_session.commit
    monkeypatch.setattr(db_session, "commit", AsyncMock(side_effect=RuntimeError("commit failed")))

    with pytest.raises(RuntimeError, match="commit failed"):
        await repo.create_compatibility_project_for_gallery(
            gallery_id,
            owner_id,
            project_name="Detached Project",
            gallery_name="Detached Gallery",
        )

    monkeypatch.setattr(db_session, "commit", original_commit)
    db_session.expire_all()

    project_count = int((await db_session.execute(select(func.count()).select_from(Project).where(Project.owner_id == owner_id, Project.is_deleted.is_(False)))).scalar_one() or 0)
    reloaded_gallery = await db_session.get(Gallery, gallery_id)

    assert project_count == 1
    assert reloaded_gallery is not None
    assert reloaded_gallery.project_id == source_project_id
    assert reloaded_gallery.name == "Source Project"


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
async def test_get_projects_by_owner_sorts_before_pagination_and_counts_direct_only_galleries(
    repo: ProjectRepository,
    db_session,
):
    user = await _create_user(db_session, "project-sort")
    other_user = await _create_user(db_session, "project-sort-other")

    alpha = await repo.create_project(user.id, "Alpha", shooting_date=date(2026, 4, 20))
    beta = await repo.create_project(user.id, "Beta", shooting_date=date(2026, 4, 18))
    gamma = await repo.create_project(user.id, "Gamma", shooting_date=date(2026, 4, 22))
    other_project = await repo.create_project(other_user.id, "Other Owner", shooting_date=date(2026, 4, 10))

    alpha.created_at = datetime(2026, 4, 2, 12, 0, tzinfo=UTC)
    beta.created_at = datetime(2026, 4, 1, 12, 0, tzinfo=UTC)
    gamma.created_at = datetime(2026, 4, 3, 12, 0, tzinfo=UTC)
    other_project.created_at = datetime(2026, 4, 4, 12, 0, tzinfo=UTC)
    await db_session.commit()

    alpha_gallery = await _create_project_gallery(
        db_session,
        user.id,
        alpha.id,
        name="Alpha Listed",
        position=0,
    )
    beta_hidden_gallery = await _create_project_gallery(
        db_session,
        user.id,
        beta.id,
        name="Beta Hidden",
        position=0,
        visibility=ProjectVisibility.DIRECT_ONLY,
    )
    other_gallery = await _create_project_gallery(
        db_session,
        other_user.id,
        other_project.id,
        name="Other",
        position=0,
    )

    await _create_photo(
        db_session,
        alpha_gallery.id,
        display_name="alpha.jpg",
        thumbnail_object_key="alpha-thumb",
        file_size=100,
        uploaded_at=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
    )
    for index, file_size in enumerate([200, 300, 400], start=1):
        await _create_photo(
            db_session,
            beta_hidden_gallery.id,
            display_name=f"beta-{index}.jpg",
            thumbnail_object_key=f"beta-{index}-thumb",
            file_size=file_size,
            uploaded_at=datetime(2026, 4, 18, 10 + index, 0, tzinfo=UTC),
            status=PhotoUploadStatus.PENDING,
        )
    for index in range(5):
        await _create_photo(
            db_session,
            other_gallery.id,
            display_name=f"other-{index}.jpg",
            thumbnail_object_key=f"other-{index}-thumb",
            file_size=1_000,
            uploaded_at=datetime(2026, 4, 10, 10, index, tzinfo=UTC),
        )

    default_results, default_total = await repo.get_projects_by_owner(user.id, page=1, size=10)
    name_results, _ = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        sort_by=ProjectListSortBy.NAME,
        order=SortOrder.ASC,
    )
    name_desc_results, _ = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        sort_by=ProjectListSortBy.NAME,
        order=SortOrder.DESC,
    )
    shooting_asc_results, _ = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        sort_by=ProjectListSortBy.SHOOTING_DATE,
        order=SortOrder.ASC,
    )
    shooting_results, _ = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        sort_by=ProjectListSortBy.SHOOTING_DATE,
        order=SortOrder.DESC,
    )
    photo_count_page, photo_count_total = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=1,
        sort_by=ProjectListSortBy.PHOTO_COUNT,
        order=SortOrder.DESC,
    )
    size_results, _ = await repo.get_projects_by_owner(
        user.id,
        page=1,
        size=10,
        sort_by=ProjectListSortBy.TOTAL_SIZE_BYTES,
        order=SortOrder.ASC,
    )

    assert default_total == 3
    assert [project.id for project in default_results] == [gamma.id, alpha.id, beta.id]
    assert [project.id for project in name_results] == [alpha.id, beta.id, gamma.id]
    assert [project.id for project in name_desc_results] == [gamma.id, beta.id, alpha.id]
    assert [project.id for project in shooting_asc_results] == [beta.id, alpha.id, gamma.id]
    assert [project.id for project in shooting_results] == [gamma.id, alpha.id, beta.id]
    assert photo_count_total == 3
    assert [project.id for project in photo_count_page] == [beta.id]
    assert [project.id for project in size_results] == [gamma.id, alpha.id, beta.id]


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
        first_gallery.id,
        display_name="alpha-latest.jpg",
        thumbnail_object_key="alpha-latest-thumb",
        file_size=110,
        uploaded_at=datetime(2026, 4, 19, 11, 0, tzinfo=UTC),
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
    assert recent_keys[first_project.id] == ["alpha-latest-thumb", "beta-thumb"]
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


@pytest.mark.asyncio
async def test_update_project_appearance_fields(repo: ProjectRepository, db_session):
    """Covers update_project appearance branches (cover_photo_id, focal, display, spacing, color)."""
    user = await _create_user(db_session, "project-appearance")
    project, gallery = await repo.create_project_with_initial_gallery(user.id, "Appearance Project")
    photo = await _create_photo(
        db_session,
        gallery_id=gallery.id,
        display_name="test.jpg",
        thumbnail_object_key="thumb-key",
        file_size=1024,
        uploaded_at=datetime.now(UTC),
    )

    updated = await repo.update_project(
        project.id,
        user.id,
        cover_photo_id=photo.id,
        cover_focal_x=25.0,
        cover_focal_y=75.0,
        cover_display_option=CoverDisplayOption.MINIMALIST,
        public_photo_spacing=PhotoSpacing.SMALL,
        public_color_scheme=PublicColorScheme.DARK,
    )
    assert updated is not None
    assert updated.cover_photo_id == photo.id
    assert updated.cover_focal_x == 25.0
    assert updated.cover_focal_y == 75.0
    assert updated.cover_display_option == CoverDisplayOption.MINIMALIST.value
    assert updated.public_photo_spacing == PhotoSpacing.SMALL.value
    assert updated.public_color_scheme == PublicColorScheme.DARK.value

    # Clear cover_photo_id
    cleared = await repo.update_project(project.id, user.id, cover_photo_id=None)
    assert cleared is not None
    assert cleared.cover_photo_id is None

    # Partial update (only focal) — other fields unchanged
    focal_update = await repo.update_project(project.id, user.id, cover_focal_x=60.0, cover_focal_y=40.0)
    assert focal_update is not None
    assert focal_update.cover_focal_x == 60.0
    assert focal_update.cover_focal_y == 40.0
    assert focal_update.cover_photo_id is None
    assert focal_update.cover_display_option == CoverDisplayOption.MINIMALIST.value

    # No-op update (UNSET default) — verify no change
    noop = await repo.update_project(project.id, user.id)
    assert noop is not None
    assert noop.cover_focal_x == 60.0
    assert noop.cover_display_option == CoverDisplayOption.MINIMALIST.value


@pytest.mark.asyncio
async def test_get_project_photos_pagination(repo: ProjectRepository, db_session):
    """Covers get_project_photos — pagination across all galleries (listed + direct_only)."""

    user = await _create_user(db_session, "project-photos")
    project, first_gallery = await repo.create_project_with_initial_gallery(user.id, "Photo Project")

    # Create a second gallery (direct_only)
    second_gallery = await _create_project_gallery(
        db_session,
        user.id,
        project.id,
        name="Hidden Gallery",
        position=1,
        visibility=ProjectVisibility.DIRECT_ONLY,
    )

    now = datetime.now(UTC)
    await _create_photo(
        db_session,
        first_gallery.id,
        display_name="photo-A.jpg",
        thumbnail_object_key="t-A",
        file_size=100,
        uploaded_at=now,
    )
    await _create_photo(
        db_session,
        first_gallery.id,
        display_name="photo-B.jpg",
        thumbnail_object_key="t-B",
        file_size=200,
        uploaded_at=now,
    )
    await _create_photo(
        db_session,
        second_gallery.id,
        display_name="hidden-photo.jpg",
        thumbnail_object_key="t-H",
        file_size=300,
        uploaded_at=now,
    )

    # Full listing — all 3 photos across both galleries
    photos, total = await repo.get_project_photos(project.id, user.id, limit=10, offset=0)
    assert total == 3
    assert len(photos) == 3
    names = [p.display_name for p in photos]
    assert names == ["photo-A.jpg", "photo-B.jpg", "hidden-photo.jpg"]

    # Pagination: limit=1, offset=0
    p1, t1 = await repo.get_project_photos(project.id, user.id, limit=1, offset=0)
    assert t1 == 3
    assert len(p1) == 1
    assert p1[0].display_name == "photo-A.jpg"

    # Pagination: offset=1, limit=2
    p2, t2 = await repo.get_project_photos(project.id, user.id, limit=2, offset=1)
    assert t2 == 3
    assert [p.display_name for p in p2] == ["photo-B.jpg", "hidden-photo.jpg"]

    # Empty project
    empty_project = await repo.create_project(user.id, "Empty Photos")
    empty_photos, empty_total = await repo.get_project_photos(empty_project.id, user.id, limit=10, offset=0)
    assert empty_total == 0
    assert empty_photos == []


@pytest.mark.asyncio
async def test_get_photo_by_id_for_project(repo: ProjectRepository, db_session):
    """Covers get_photo_by_id_for_project with and without owner_id filter."""
    user = await _create_user(db_session, "project-photo-lookup")
    project, gallery = await repo.create_project_with_initial_gallery(user.id, "Lookup Project")

    photo = await _create_photo(
        db_session,
        gallery.id,
        display_name="lookup-photo.jpg",
        thumbnail_object_key="t-lookup",
        file_size=500,
        uploaded_at=datetime.now(UTC),
    )

    # With owner_id filter
    found = await repo.get_photo_by_id_for_project(project.id, photo.id, owner_id=user.id)
    assert found is not None
    assert found.id == photo.id
    assert found.display_name == "lookup-photo.jpg"

    # Without owner_id filter (public share path)
    found_no_owner = await repo.get_photo_by_id_for_project(project.id, photo.id)
    assert found_no_owner is not None
    assert found_no_owner.id == photo.id

    # Wrong photo_id — not found
    missing = await repo.get_photo_by_id_for_project(project.id, uuid.uuid4())
    assert missing is None

    # Wrong project_id — not found
    wrong_project = await repo.get_photo_by_id_for_project(uuid.uuid4(), photo.id)
    assert wrong_project is None

    # Wrong owner_id filter — not found (photo belongs to user, filter by another)
    wrong_owner = await repo.get_photo_by_id_for_project(project.id, photo.id, owner_id=uuid.uuid4())
    assert wrong_owner is None
