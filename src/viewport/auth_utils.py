import uuid

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.models.db import get_db
from viewport.models.user import User


class AuthSettings(BaseSettings):
    """Settings for authentication, loaded from environment variables."""

    jwt_secret_key: str
    admin_jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 7200
    invite_code: str = "testinvitecode"  # Default invite code for tests

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


authsettings = AuthSettings()

security = HTTPBearer(auto_error=False)


async def _get_user_from_token(token: str | None, db: AsyncSession) -> User:
    """Resolve the current user from a JWT access token."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(token, authsettings.jwt_secret_key, algorithms=[authsettings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Validate UUID format
        try:
            uuid.UUID(user_id)
        except ValueError:
            raise HTTPException(status_code=401, detail="User not found") from None

        stmt = select(User).where(User.id == user_id)
        user = (await db.execute(stmt)).scalar_one_or_none()
        if db.in_transaction():
            await db.commit()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token") from None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials if credentials else None
    return await _get_user_from_token(token, db)


async def get_current_user_for_download(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve auth for browser-managed downloads.

    Browser form submissions cannot set the Authorization header, so for
    download endpoints we also accept an access token from form body.
    Query-string tokens are intentionally not supported to avoid leaking
    bearer credentials via URLs.
    """
    token = credentials.credentials if credentials else None

    if not token and request.method not in {"GET", "HEAD"}:
        form = await request.form()
        token_value = form.get("access_token")
        if isinstance(token_value, str):
            token = token_value

    return await _get_user_from_token(token, db)
