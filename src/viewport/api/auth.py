import uuid
from datetime import UTC, datetime, timedelta
from os import getenv

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from viewport.auth_metrics import REFRESH_FAMILIES_REVOKED, REFRESH_REJECTS, REFRESH_ROTATIONS
from viewport.auth_utils import authsettings, password_token_fingerprint, password_token_fingerprint_matches
from viewport.dependencies import get_user_repository
from viewport.models.user import User
from viewport.repositories.refresh_token_repository import RefreshRotationRejected, RefreshTokenRepository
from viewport.repositories.user_repository import UserRepository
from viewport.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, RegisterResponse, TokenPair, validate_user_password
from viewport.services.auth_rate_limiter import AuthRateLimitRoute, get_auth_rate_limiter

router = APIRouter(prefix="/auth", tags=["auth"])

_DEFAULT_BCRYPT_ROUNDS = 12
_MIN_BCRYPT_ROUNDS = 4
_MAX_BCRYPT_ROUNDS = 31


def _resolve_bcrypt_rounds() -> int:
    raw_value = getenv("BCRYPT_ROUNDS")
    if raw_value is None:
        return _DEFAULT_BCRYPT_ROUNDS

    try:
        rounds = int(raw_value)
    except ValueError:
        return _DEFAULT_BCRYPT_ROUNDS

    return max(_MIN_BCRYPT_ROUNDS, min(_MAX_BCRYPT_ROUNDS, rounds))


_BCRYPT_ROUNDS = _resolve_bcrypt_rounds()
# A dummy hash to use when the user is not found, to prevent timing attacks.
DUMMY_HASH = bcrypt.hashpw(b"viewport-dummy-password", bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with a random salt."""
    validate_user_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    validate_user_password(password)
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, password_hash: str) -> str:
    issued_at = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=authsettings.access_token_expire_minutes),
        "type": "access",
        "jti": str(uuid.uuid4()),
        "pwd": password_token_fingerprint(password_hash),
    }
    return jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)


def create_refresh_token(
    user_id: str,
    password_hash: str,
    *,
    jti: str | None = None,
    issued_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> str:
    issued_at = issued_at or datetime.now(UTC)
    expires_at = expires_at or issued_at + timedelta(minutes=authsettings.refresh_token_expire_minutes)
    payload = {
        "sub": user_id,
        "iat": issued_at,
        "exp": expires_at,
        "type": "refresh",
        "jti": jti or str(uuid.uuid4()),
        "pwd": password_token_fingerprint(password_hash),
    }
    return jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_user(request: RegisterRequest, repo: UserRepository = Depends(get_user_repository)) -> RegisterResponse:
    """Register user."""
    # Verify invite code
    if request.invite_code != authsettings.invite_code:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    hashed_password = await run_in_threadpool(hash_password, request.password)

    try:
        user = await repo.create_user(request.email, hashed_password)
    except IntegrityError as err:
        raise HTTPException(status_code=400, detail="Email already registered") from err
    return RegisterResponse(id=str(user.id), email=user.email)


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login_user(
    request: LoginRequest,
    http_request: Request,
    repo: UserRepository = Depends(get_user_repository),
) -> LoginResponse:
    """Login user."""
    await get_auth_rate_limiter().enforce(
        http_request,
        AuthRateLimitRoute.USER_LOGIN,
        request.email,
    )
    user = await repo.get_user_by_email(request.email)

    if not user:
        # Prevent timing attacks by hashing a dummy password
        await run_in_threadpool(verify_password, request.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    is_valid = await run_in_threadpool(verify_password, request.password, user.password_hash)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    locked_password_hash = (await repo.db.execute(select(User.password_hash).where(User.id == user.id).with_for_update())).scalar_one_or_none()
    if locked_password_hash != user.password_hash:
        await repo.db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=authsettings.refresh_token_expire_minutes)
    refresh_jti = str(uuid.uuid4())
    refresh_token = create_refresh_token(
        str(user.id),
        locked_password_hash,
        jti=refresh_jti,
        issued_at=issued_at,
        expires_at=expires_at,
    )
    await RefreshTokenRepository(repo.db).create_root(
        user.id,
        refresh_jti,
        uuid.uuid4(),
        issued_at,
        expires_at,
    )
    access_token = create_access_token(str(user.id), locked_password_hash)
    return LoginResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        storage_used=user.storage_used,
        storage_quota=user.storage_quota,
        tokens={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"},
    )


@router.post("/refresh", response_model=TokenPair, status_code=status.HTTP_200_OK)
async def refresh_token(request: RefreshRequest, repo: UserRepository = Depends(get_user_repository)) -> TokenPair:
    """Refresh token."""
    try:
        # Decode and validate the refresh token
        payload = jwt.decode(request.refresh_token, authsettings.jwt_secret_key, algorithms=[authsettings.jwt_algorithm])
        user_id = payload.get("sub")
        token_type = payload.get("type")
        token_password_fingerprint = payload.get("pwd")
        parent_jti = payload.get("jti")

        # Check if it's actually a refresh token
        if token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        if not isinstance(user_id, str) or not user_id or not isinstance(parent_jti, str) or not parent_jti:
            REFRESH_REJECTS.labels(reason="invalid_claims").inc()
            raise HTTPException(status_code=401, detail="Invalid token")

        # Check if user exists
        try:
            parsed_user_id = uuid.UUID(user_id)
        except ValueError:
            REFRESH_REJECTS.labels(reason="invalid_claims").inc()
            raise HTTPException(status_code=401, detail="Invalid refresh token") from None

        user_stmt = select(User).where(User.id == parsed_user_id).with_for_update()
        user = (await repo.db.execute(user_stmt)).scalar_one_or_none()
        if not user:
            await repo.db.commit()
            REFRESH_REJECTS.labels(reason="user_not_found").inc()
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        if not password_token_fingerprint_matches(token_password_fingerprint, user.password_hash):
            await repo.db.commit()
            REFRESH_REJECTS.labels(reason="password_changed").inc()
            raise HTTPException(status_code=401, detail="Refresh token revoked")

        issued_at = datetime.now(UTC)
        expires_at = issued_at + timedelta(minutes=authsettings.refresh_token_expire_minutes)
        child_jti = str(uuid.uuid4())
        new_refresh_token = create_refresh_token(
            str(user.id),
            user.password_hash,
            jti=child_jti,
            issued_at=issued_at,
            expires_at=expires_at,
        )
        rotation = await RefreshTokenRepository(repo.db).consume_and_create_child(
            user.id,
            parent_jti,
            child_jti,
            issued_at,
            expires_at,
        )
        if isinstance(rotation, RefreshRotationRejected):
            REFRESH_REJECTS.labels(reason=rotation.reason.value).inc()
            if rotation.revoked_sessions:
                REFRESH_FAMILIES_REVOKED.labels(reason="replay").inc()
            raise HTTPException(status_code=401, detail="Refresh token revoked")

        new_access_token = create_access_token(str(user.id), user.password_hash)
        REFRESH_ROTATIONS.inc()
        return TokenPair(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")

    except jwt.ExpiredSignatureError:
        REFRESH_REJECTS.labels(reason="expired").inc()
        raise HTTPException(status_code=401, detail="Refresh token expired") from None
    except jwt.InvalidTokenError:
        REFRESH_REJECTS.labels(reason="invalid_jwt").inc()
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None
