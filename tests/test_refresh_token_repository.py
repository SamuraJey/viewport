import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from viewport.models.refresh_token_session import RefreshTokenSession
from viewport.models.user import User
from viewport.repositories.refresh_token_repository import (
    RefreshRotationRejected,
    RefreshRotationRejectReason,
    RefreshRotationSuccess,
    RefreshSessionUserNotFoundError,
    RefreshTokenRepository,
    hash_refresh_jti,
)
from viewport.repositories.user_repository import UserRepository


async def _create_user(db: AsyncSession) -> User:
    user = User(
        email=f"refresh-{uuid4()}@example.com",
        password_hash="hashed-password",
    )
    db.add(user)
    await db.commit()
    return user


def test_hash_refresh_jti_rejects_empty_value() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        hash_refresh_jti("")


@pytest.mark.asyncio
async def test_create_root_rolls_back_when_user_does_not_exist(db_session: AsyncSession) -> None:
    missing_user_id = uuid4()
    raw_jti = f"missing-user-{uuid4()}"
    issued_at = datetime.now(UTC)

    with pytest.raises(RefreshSessionUserNotFoundError):
        await RefreshTokenRepository(db_session).create_root(
            missing_user_id,
            raw_jti,
            uuid4(),
            issued_at,
            issued_at + timedelta(days=1),
        )

    assert await db_session.get(RefreshTokenSession, hash_refresh_jti(raw_jti)) is None


@pytest.mark.asyncio
async def test_create_root_persists_only_the_jti_hash(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    raw_jti = f"root-{uuid4()}"
    issued_at = datetime.now(UTC)

    snapshot = await repo.create_root(
        user.id,
        raw_jti,
        uuid4(),
        issued_at,
        issued_at + timedelta(days=1),
    )

    stored = await db_session.get(RefreshTokenSession, snapshot.jti_hash)
    assert stored is not None
    assert stored.jti_hash == hash_refresh_jti(raw_jti)
    assert stored.jti_hash != raw_jti
    assert stored.parent_jti_hash is None
    assert len(stored.jti_hash) == 64


@pytest.mark.asyncio
async def test_sequential_replay_revokes_the_rotated_child_and_family(
    db_session: AsyncSession,
) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    root_jti = f"root-{uuid4()}"
    child_jti = f"child-{uuid4()}"
    issued_at = datetime.now(UTC)
    family_id = uuid4()
    await repo.create_root(
        user.id,
        root_jti,
        family_id,
        issued_at,
        issued_at + timedelta(days=1),
    )

    rotated_at = issued_at + timedelta(seconds=1)
    first_result = await repo.consume_and_create_child(
        user.id,
        root_jti,
        child_jti,
        rotated_at,
        rotated_at + timedelta(days=1),
    )
    replay_result = await repo.consume_and_create_child(
        user.id,
        root_jti,
        f"replay-child-{uuid4()}",
        rotated_at + timedelta(seconds=1),
        rotated_at + timedelta(days=1),
    )

    assert isinstance(first_result, RefreshRotationSuccess)
    assert isinstance(replay_result, RefreshRotationRejected)
    assert replay_result.reason is RefreshRotationRejectReason.USED
    assert replay_result.family_id == family_id
    assert replay_result.revoked_sessions == 2

    family = (
        (
            await db_session.execute(
                select(RefreshTokenSession).where(
                    RefreshTokenSession.family_id == family_id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(family) == 2
    assert all(session.revoked_at is not None for session in family)
    child = next(session for session in family if session.parent_jti_hash is not None)
    assert child.jti_hash == hash_refresh_jti(child_jti)


@pytest.mark.asyncio
async def test_rotation_returns_user_not_found_without_creating_child(db_session: AsyncSession) -> None:
    result = await RefreshTokenRepository(db_session).consume_and_create_child(
        uuid4(),
        f"missing-parent-{uuid4()}",
        f"missing-child-{uuid4()}",
        datetime.now(UTC),
        datetime.now(UTC) + timedelta(days=1),
    )

    assert result == RefreshRotationRejected(RefreshRotationRejectReason.USER_NOT_FOUND)


@pytest.mark.asyncio
async def test_rotation_of_unknown_parent_returns_not_found(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)

    result = await RefreshTokenRepository(db_session).consume_and_create_child(
        user.id,
        f"unknown-parent-{uuid4()}",
        f"child-{uuid4()}",
        datetime.now(UTC),
        datetime.now(UTC) + timedelta(days=1),
    )

    assert result == RefreshRotationRejected(RefreshRotationRejectReason.NOT_FOUND)


@pytest.mark.asyncio
async def test_rotation_of_expired_parent_revokes_its_family(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    now = datetime.now(UTC)
    root_jti = f"expired-root-{uuid4()}"
    snapshot = await repo.create_root(
        user.id,
        root_jti,
        uuid4(),
        now - timedelta(days=2),
        now - timedelta(days=1),
    )

    result = await repo.consume_and_create_child(
        user.id,
        root_jti,
        f"child-{uuid4()}",
        now,
        now + timedelta(days=1),
    )

    assert isinstance(result, RefreshRotationRejected)
    assert result.reason is RefreshRotationRejectReason.EXPIRED
    assert result.family_id == snapshot.family_id
    assert result.revoked_sessions == 1
    stored = await db_session.get(RefreshTokenSession, snapshot.jti_hash)
    assert stored is not None
    assert stored.revoked_at == now


@pytest.mark.asyncio
async def test_rotation_of_revoked_parent_reports_revoked_without_rewriting_timestamp(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    now = datetime.now(UTC)
    root_jti = f"revoked-root-{uuid4()}"
    snapshot = await repo.create_root(user.id, root_jti, uuid4(), now, now + timedelta(days=1))
    revoked_at = now + timedelta(seconds=1)
    assert await repo.revoke_all_for_user(user.id, revoked_at=revoked_at, commit=True) == 1

    result = await repo.consume_and_create_child(
        user.id,
        root_jti,
        f"child-{uuid4()}",
        revoked_at + timedelta(seconds=1),
        now + timedelta(days=1),
    )

    assert isinstance(result, RefreshRotationRejected)
    assert result.reason is RefreshRotationRejectReason.REVOKED
    assert result.family_id == snapshot.family_id
    assert result.revoked_sessions == 0
    stored = await db_session.get(RefreshTokenSession, snapshot.jti_hash)
    assert stored is not None
    assert stored.revoked_at == revoked_at


@pytest.mark.asyncio
async def test_rotation_commit_failure_rolls_back_parent_consumption(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    now = datetime.now(UTC)
    parent_jti = f"parent-{uuid4()}"
    colliding_child_jti = f"existing-{uuid4()}"
    parent = await repo.create_root(user.id, parent_jti, uuid4(), now, now + timedelta(days=1))
    await repo.create_root(user.id, colliding_child_jti, uuid4(), now, now + timedelta(days=1))

    with pytest.raises(IntegrityError):
        await repo.consume_and_create_child(
            user.id,
            parent_jti,
            colliding_child_jti,
            now + timedelta(seconds=1),
            now + timedelta(days=1),
        )

    stored_parent = await db_session.get(RefreshTokenSession, parent.jti_hash)
    assert stored_parent is not None
    assert stored_parent.used_at is None
    assert stored_parent.replaced_by_jti_hash is None


@pytest.mark.asyncio
async def test_concurrent_consumes_allow_one_child_then_revoke_it_on_replay(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
) -> None:
    user = await _create_user(db_session)
    root_jti = f"root-{uuid4()}"
    issued_at = datetime.now(UTC)
    family_id = uuid4()
    await RefreshTokenRepository(db_session).create_root(
        user.id,
        root_jti,
        family_id,
        issued_at,
        issued_at + timedelta(days=1),
    )
    session_factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    attempted_children = [f"child-{uuid4()}", f"child-{uuid4()}"]
    rotated_at = issued_at + timedelta(seconds=1)

    async def _consume(child_jti: str):
        async with session_factory() as independent_db:
            return await RefreshTokenRepository(independent_db).consume_and_create_child(
                user.id,
                root_jti,
                child_jti,
                rotated_at,
                rotated_at + timedelta(days=1),
            )

    results = await asyncio.gather(*(_consume(child_jti) for child_jti in attempted_children))

    successes = [result for result in results if isinstance(result, RefreshRotationSuccess)]
    rejections = [result for result in results if isinstance(result, RefreshRotationRejected)]
    assert len(successes) == 1
    assert len(rejections) == 1
    assert rejections[0].reason is RefreshRotationRejectReason.USED
    assert rejections[0].family_id == family_id
    assert rejections[0].revoked_sessions == 2

    family = (
        (
            await db_session.execute(
                select(RefreshTokenSession).where(
                    RefreshTokenSession.family_id == family_id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(family) == 2
    successful_child = await db_session.get(
        RefreshTokenSession,
        successes[0].session.jti_hash,
    )
    assert successful_child is not None
    assert successful_child.parent_jti_hash == hash_refresh_jti(root_jti)
    assert successful_child.revoked_at is not None


@pytest.mark.asyncio
async def test_revoke_all_for_user_revokes_every_family(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repo = RefreshTokenRepository(db_session)
    issued_at = datetime.now(UTC)
    for _ in range(2):
        await repo.create_root(
            user.id,
            f"root-{uuid4()}",
            uuid4(),
            issued_at,
            issued_at + timedelta(days=1),
        )
    revoked_at = issued_at + timedelta(minutes=1)

    revoked_count = await repo.revoke_all_for_user(
        user.id,
        revoked_at=revoked_at,
        commit=True,
    )
    already_revoked_count = await repo.revoke_all_for_user(user.id, commit=True)

    sessions = (
        (
            await db_session.execute(
                select(RefreshTokenSession).where(
                    RefreshTokenSession.user_id == user.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert revoked_count == 2
    assert already_revoked_count == 0
    assert len(sessions) == 2
    assert all(session.revoked_at == revoked_at for session in sessions)


@pytest.mark.asyncio
async def test_revoke_all_commits_when_requested_for_missing_user() -> None:
    db = AsyncMock(spec=AsyncSession)
    repo = RefreshTokenRepository(db)
    repo.lock_user_for_update = AsyncMock(return_value=False)  # type: ignore[method-assign]

    result = await repo.revoke_all_for_user(uuid4(), commit=True)

    assert result == 0
    db.commit.assert_awaited_once()
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_all_rolls_back_failed_committed_sweep() -> None:
    db = AsyncMock(spec=AsyncSession)
    db.execute.side_effect = RuntimeError("database unavailable")
    repo = RefreshTokenRepository(db)

    with pytest.raises(RuntimeError, match="database unavailable"):
        await repo.revoke_all_for_user(uuid4(), commit=True, lock_user=False)

    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_sessions_are_deleted_with_their_user(
    db_session: AsyncSession,
) -> None:
    user = await _create_user(db_session)
    issued_at = datetime.now(UTC)
    snapshot = await RefreshTokenRepository(db_session).create_root(
        user.id,
        f"root-{uuid4()}",
        uuid4(),
        issued_at,
        issued_at + timedelta(days=1),
    )

    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.commit()

    assert await db_session.get(RefreshTokenSession, snapshot.jti_hash) is None


@pytest.mark.asyncio
async def test_password_change_loser_detects_hash_changed_while_waiting_for_user_lock(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
) -> None:
    user = await _create_user(db_session)
    session_factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async with session_factory() as first_db, session_factory() as second_db:
        stale_second_user = await second_db.get(User, user.id)
        assert stale_second_user is not None
        expected_hash = stale_second_user.password_hash

        assert await RefreshTokenRepository(first_db).lock_user_for_update(user.id)
        waiter_started = asyncio.Event()

        async def _wait_then_compare() -> bool:
            waiter_started.set()
            assert await RefreshTokenRepository(second_db).lock_user_for_update(user.id)
            locked_hash = await UserRepository(second_db).get_user_password_hash(user.id)
            await second_db.rollback()
            return locked_hash == expected_hash

        delayed_change = asyncio.create_task(_wait_then_compare())
        await waiter_started.wait()
        await asyncio.sleep(0.05)
        await UserRepository(first_db).update_user_password(
            user.id,
            "winner-password-hash",
            commit=False,
        )
        await first_db.commit()

        assert await delayed_change is False
