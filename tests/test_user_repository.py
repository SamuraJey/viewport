import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from viewport.models.user import User
from viewport.repositories.user_repository import UserRepository


@pytest_asyncio.fixture
async def owner_id(db_session) -> uuid.UUID:
    owner = User(
        email=f"owner-{uuid.uuid4()}@example.com",
        password_hash="testpassword",
        display_name="test user",
        storage_quota=1000,
        storage_used=0,
        storage_reserved=0,
    )
    db_session.add(owner)
    await db_session.commit()
    return owner.id


@pytest_asyncio.fixture
async def user_repo(db_session) -> UserRepository:
    return UserRepository(db_session)


@pytest.mark.asyncio
async def test_reserve_storage_zero_bytes_returns_true(user_repo: UserRepository, owner_id: uuid.UUID) -> None:
    """Covers line 67: bytes_to_reserve <= 0 short-circuits to True."""
    result = await user_repo.reserve_storage(owner_id, 0)
    assert result is True


@pytest.mark.asyncio
async def test_reserve_storage_exceeds_quota_returns_false(user_repo: UserRepository, owner_id: uuid.UUID, db_session) -> None:
    """Covers lines 80-81: when UPDATE matches no rows → rollback + return False."""
    # Set storage_used to 999 so only 1 byte of quota remains available
    stmt = select(User).where(User.id == owner_id)
    result = await db_session.execute(stmt)
    user = result.scalar_one()
    user.storage_used = 999
    await db_session.commit()

    # Try to reserve 100 bytes when only 1 is available → should fail
    result = await user_repo.reserve_storage(owner_id, 100, commit=False)
    assert result is False


@pytest.mark.asyncio
async def test_reserve_storage_with_commit_true_commits(user_repo: UserRepository, owner_id: uuid.UUID, db_session) -> None:
    """Covers line 84: when commit=True, the transaction is committed."""
    result = await user_repo.reserve_storage(owner_id, 100, commit=True)
    assert result is True

    # Read the user fresh to verify committed state
    stmt = select(User).where(User.id == owner_id)
    fresh_result = await db_session.execute(stmt)
    fresh_user = fresh_result.scalar_one()
    assert fresh_user.storage_reserved == 100
