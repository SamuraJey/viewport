import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from viewport import background_tasks
from viewport.background_tasks import cleanup_refresh_token_sessions_task
from viewport.models.refresh_token_session import RefreshTokenSession
from viewport.models.user import User
from viewport.repositories.refresh_token_repository import hash_refresh_jti


def test_refresh_session_cleanup_preserves_the_audit_retention_window(
    sync_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(background_tasks, "REFRESH_SESSION_CLEANUP_BATCH_SIZE", 2)
    now = datetime.now(UTC)
    stale_expired_hashes = {
        hash_refresh_jti(f"stale-expired-{uuid4()}"),
        hash_refresh_jti(f"stale-expired-{uuid4()}"),
    }
    stale_revoked_hashes = {
        hash_refresh_jti(f"stale-revoked-{uuid4()}"),
        hash_refresh_jti(f"stale-revoked-{uuid4()}"),
    }
    recent_expired_hash = hash_refresh_jti(f"recent-expired-{uuid4()}")
    recent_revoked_hash = hash_refresh_jti(f"recent-revoked-{uuid4()}")
    recently_revoked_old_expiry_hash = hash_refresh_jti(f"recently-revoked-old-expiry-{uuid4()}")
    active_hash = hash_refresh_jti(f"active-{uuid4()}")
    retained_hashes = {recent_expired_hash, recent_revoked_hash, recently_revoked_old_expiry_hash, active_hash}

    with Session(sync_engine) as db:
        user = User(
            email=f"refresh-cleanup-{uuid4()}@example.com",
            password_hash="hashed-password",
        )
        db.add(user)
        db.flush()
        db.add_all(
            [
                *[
                    RefreshTokenSession(
                        jti_hash=jti_hash,
                        user_id=user.id,
                        family_id=uuid4(),
                        issued_at=now - timedelta(days=30),
                        expires_at=now - timedelta(days=8),
                    )
                    for jti_hash in stale_expired_hashes
                ],
                *[
                    RefreshTokenSession(
                        jti_hash=jti_hash,
                        user_id=user.id,
                        family_id=uuid4(),
                        issued_at=now - timedelta(days=30),
                        expires_at=now + timedelta(days=1),
                        revoked_at=now - timedelta(days=8),
                    )
                    for jti_hash in stale_revoked_hashes
                ],
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
                    jti_hash=recently_revoked_old_expiry_hash,
                    user_id=user.id,
                    family_id=uuid4(),
                    issued_at=now - timedelta(days=30),
                    expires_at=now - timedelta(days=8),
                    revoked_at=now - timedelta(days=1),
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
    assert result["deleted_count"] == 4
    assert remaining_hashes == retained_hashes
    assert stale_expired_hashes.isdisjoint(remaining_hashes)
    assert stale_revoked_hashes.isdisjoint(remaining_hashes)


def test_refresh_session_cleanup_rechecks_retention_after_concurrent_revoke(
    sync_engine: Engine,
) -> None:
    now = datetime.now(UTC)
    token_hash = hash_refresh_jti(f"concurrent-revoke-{uuid4()}")

    with Session(sync_engine) as setup_db:
        user = User(
            email=f"refresh-cleanup-race-{uuid4()}@example.com",
            password_hash="hashed-password",
        )
        setup_db.add(user)
        setup_db.flush()
        setup_db.add(
            RefreshTokenSession(
                jti_hash=token_hash,
                user_id=user.id,
                family_id=uuid4(),
                issued_at=now - timedelta(days=30),
                expires_at=now - timedelta(days=8),
            )
        )
        setup_db.commit()

    with Session(sync_engine) as revoker_db:
        session = revoker_db.scalar(select(RefreshTokenSession).where(RefreshTokenSession.jti_hash == token_hash).with_for_update())
        assert session is not None

        with ThreadPoolExecutor(max_workers=1) as executor:
            cleanup = executor.submit(cleanup_refresh_token_sessions_task.run)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                with sync_engine.connect() as observer:
                    cleanup_waits_for_lock = observer.scalar(
                        text(
                            """
                            SELECT EXISTS (
                                SELECT 1
                                FROM pg_stat_activity
                                WHERE datname = current_database()
                                  AND pid <> pg_backend_pid()
                                  AND wait_event_type = 'Lock'
                                  AND query LIKE 'DELETE FROM refresh_token_sessions%'
                            )
                            """
                        )
                    )
                if cleanup_waits_for_lock:
                    break
                time.sleep(0.01)
            else:
                pytest.fail("cleanup did not reach the locked refresh-token row")

            session.revoked_at = now
            revoker_db.commit()
            result = cleanup.result(timeout=5)

    with Session(sync_engine) as verification_db:
        retained = verification_db.scalar(select(RefreshTokenSession).where(RefreshTokenSession.jti_hash == token_hash))

    assert result["deleted_count"] == 0
    assert retained is not None
    assert retained.revoked_at == now
