import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from hashlib import sha256

from sqlalchemy import select, update

from viewport.models.refresh_token_session import RefreshTokenSession
from viewport.models.user import User
from viewport.repositories.base_repository import BaseRepository


def hash_refresh_jti(jti: str) -> str:
    """Hash a high-entropy refresh-token JTI before it crosses the DB boundary."""
    if not jti:
        raise ValueError("Refresh token JTI must not be empty")
    return sha256(jti.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class RefreshSessionSnapshot:
    jti_hash: str
    user_id: uuid.UUID
    family_id: uuid.UUID
    parent_jti_hash: str | None
    issued_at: datetime
    expires_at: datetime


class RefreshRotationRejectReason(StrEnum):
    USER_NOT_FOUND = "user_not_found"
    NOT_FOUND = "not_found"
    USED = "used"
    REVOKED = "revoked"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class RefreshRotationSuccess:
    session: RefreshSessionSnapshot


@dataclass(frozen=True, slots=True)
class RefreshRotationRejected:
    reason: RefreshRotationRejectReason
    family_id: uuid.UUID | None = None
    revoked_sessions: int = 0


type RefreshRotationResult = RefreshRotationSuccess | RefreshRotationRejected


class RefreshSessionUserNotFoundError(LookupError):
    pass


class RefreshTokenRepository(BaseRepository):
    """Atomic persistence primitives for single-use refresh-token families."""

    async def lock_user_for_update(self, user_id: uuid.UUID) -> bool:
        """Serialize token-family mutations with user security-state changes."""
        stmt = select(User.id).where(User.id == user_id).with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none() is not None

    async def create_root(
        self,
        user_id: uuid.UUID,
        jti: str,
        family_id: uuid.UUID,
        issued_at: datetime,
        expires_at: datetime,
    ) -> RefreshSessionSnapshot:
        """Create and commit a root session; never returns before durability."""
        jti_hash = hash_refresh_jti(jti)
        snapshot = RefreshSessionSnapshot(
            jti_hash=jti_hash,
            user_id=user_id,
            family_id=family_id,
            parent_jti_hash=None,
            issued_at=issued_at,
            expires_at=expires_at,
        )
        try:
            if not await self.lock_user_for_update(user_id):
                raise RefreshSessionUserNotFoundError(user_id)
            self.db.add(
                RefreshTokenSession(
                    jti_hash=jti_hash,
                    user_id=user_id,
                    family_id=family_id,
                    issued_at=issued_at,
                    expires_at=expires_at,
                )
            )
            await self.db.commit()
        except BaseException:
            await self.db.rollback()
            raise
        return snapshot

    async def consume_and_create_child(
        self,
        user_id: uuid.UUID,
        parent_jti: str,
        child_jti: str,
        issued_at: datetime,
        expires_at: datetime,
    ) -> RefreshRotationResult:
        """Atomically consume a parent and commit its child, revoking on replay."""
        parent_jti_hash = hash_refresh_jti(parent_jti)
        child_jti_hash = hash_refresh_jti(child_jti)

        try:
            if not await self.lock_user_for_update(user_id):
                await self.db.commit()
                return RefreshRotationRejected(RefreshRotationRejectReason.USER_NOT_FOUND)

            consume_stmt = (
                update(RefreshTokenSession)
                .where(
                    RefreshTokenSession.jti_hash == parent_jti_hash,
                    RefreshTokenSession.user_id == user_id,
                    RefreshTokenSession.used_at.is_(None),
                    RefreshTokenSession.revoked_at.is_(None),
                    RefreshTokenSession.expires_at > issued_at,
                )
                .values(
                    used_at=issued_at,
                    replaced_by_jti_hash=child_jti_hash,
                )
                .returning(RefreshTokenSession.family_id)
            )
            family_id = (await self.db.execute(consume_stmt)).scalar_one_or_none()
            if family_id is None:
                return await self._reject_and_revoke_replay(
                    user_id=user_id,
                    parent_jti_hash=parent_jti_hash,
                    rejected_at=issued_at,
                )

            snapshot = RefreshSessionSnapshot(
                jti_hash=child_jti_hash,
                user_id=user_id,
                family_id=family_id,
                parent_jti_hash=parent_jti_hash,
                issued_at=issued_at,
                expires_at=expires_at,
            )
            self.db.add(
                RefreshTokenSession(
                    jti_hash=child_jti_hash,
                    user_id=user_id,
                    family_id=family_id,
                    parent_jti_hash=parent_jti_hash,
                    issued_at=issued_at,
                    expires_at=expires_at,
                )
            )
            await self.db.commit()
        except BaseException:
            await self.db.rollback()
            raise
        return RefreshRotationSuccess(snapshot)

    async def _reject_and_revoke_replay(
        self,
        *,
        user_id: uuid.UUID,
        parent_jti_hash: str,
        rejected_at: datetime,
    ) -> RefreshRotationRejected:
        parent_stmt = select(
            RefreshTokenSession.family_id,
            RefreshTokenSession.used_at,
            RefreshTokenSession.revoked_at,
            RefreshTokenSession.expires_at,
        ).where(
            RefreshTokenSession.jti_hash == parent_jti_hash,
            RefreshTokenSession.user_id == user_id,
        )
        parent = (await self.db.execute(parent_stmt)).one_or_none()
        if parent is None:
            await self.db.commit()
            return RefreshRotationRejected(RefreshRotationRejectReason.NOT_FOUND)

        if parent.revoked_at is not None:
            reason = RefreshRotationRejectReason.REVOKED
        elif parent.used_at is not None:
            reason = RefreshRotationRejectReason.USED
        else:
            reason = RefreshRotationRejectReason.EXPIRED

        revoke_stmt = (
            update(RefreshTokenSession)
            .where(
                RefreshTokenSession.family_id == parent.family_id,
                RefreshTokenSession.revoked_at.is_(None),
            )
            .values(revoked_at=rejected_at)
            .returning(RefreshTokenSession.jti_hash)
        )
        revoked_sessions = len((await self.db.execute(revoke_stmt)).scalars().all())
        await self.db.commit()
        return RefreshRotationRejected(
            reason=reason,
            family_id=parent.family_id,
            revoked_sessions=revoked_sessions,
        )

    async def revoke_all_for_user(
        self,
        user_id: uuid.UUID,
        *,
        revoked_at: datetime | None = None,
        commit: bool = False,
        lock_user: bool = True,
    ) -> int:
        """Revoke all sessions, optionally leaving commit to a larger transaction.

        With the defaults, the caller retains the user-row lock and must commit or
        roll back the shared session. This lets a password update and revocation
        sweep be one transaction while serializing against token rotation.
        """
        revocation_time = revoked_at or datetime.now(UTC)
        try:
            if lock_user and not await self.lock_user_for_update(user_id):
                if commit:
                    await self.db.commit()
                return 0

            stmt = (
                update(RefreshTokenSession)
                .where(
                    RefreshTokenSession.user_id == user_id,
                    RefreshTokenSession.revoked_at.is_(None),
                )
                .values(revoked_at=revocation_time)
                .returning(RefreshTokenSession.jti_hash)
            )
            revoked_sessions = len((await self.db.execute(stmt)).scalars().all())
            if commit:
                await self.db.commit()
            return revoked_sessions
        except BaseException:
            if commit:
                await self.db.rollback()
            raise
