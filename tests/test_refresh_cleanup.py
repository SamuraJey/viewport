from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from viewport.background_tasks import cleanup_refresh_token_sessions_task
from viewport.models.refresh_token_session import RefreshTokenSession
from viewport.models.user import User
from viewport.repositories.refresh_token_repository import hash_refresh_jti


def test_refresh_session_cleanup_preserves_the_audit_retention_window(
    sync_engine: Engine,
) -> None:
    now = datetime.now(UTC)
    stale_expired_hash = hash_refresh_jti(f"stale-expired-{uuid4()}")
    stale_revoked_hash = hash_refresh_jti(f"stale-revoked-{uuid4()}")
    recent_expired_hash = hash_refresh_jti(f"recent-expired-{uuid4()}")
    recent_revoked_hash = hash_refresh_jti(f"recent-revoked-{uuid4()}")
    active_hash = hash_refresh_jti(f"active-{uuid4()}")
    retained_hashes = {recent_expired_hash, recent_revoked_hash, active_hash}

    with Session(sync_engine) as db:
        user = User(
            email=f"refresh-cleanup-{uuid4()}@example.com",
            password_hash="hashed-password",
        )
        db.add(user)
        db.flush()
        db.add_all(
            [
                RefreshTokenSession(
                    jti_hash=stale_expired_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=30),
                    expires_at=now - timedelta(days=8),
                ),
                RefreshTokenSession(
                    jti_hash=stale_revoked_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=30),
                    expires_at=now + timedelta(days=1),
                    revoked_at=now - timedelta(days=8),
                ),
                RefreshTokenSession(
                    jti_hash=recent_expired_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=30),
                    expires_at=now - timedelta(days=6),
                ),
                RefreshTokenSession(
                    jti_hash=recent_revoked_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=30),
                    expires_at=now + timedelta(days=1),
                    revoked_at=now - timedelta(days=6),
                ),
                RefreshTokenSession(
                    jti_hash=active_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=1),
                    expires_at=now + timedelta(days=1),
                ),
            ]
        )
        db.commit()

    result = cleanup_refresh_token_sessions_task.run()

    with Session(sync_engine) as db:
        remaining_hashes = set(db.scalars(select(RefreshTokenSession.jti_hash)).all())
    assert result["deleted_count"] == 2
    assert remaining_hashes == retained_hashes
    assert stale_expired_hash not in remaining_hashes
    assert stale_revoked_hash not in remaining_hashes
