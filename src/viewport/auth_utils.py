import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.viewport.db import get_db
from src.viewport.models.user import User


class AuthSettings(BaseSettings):
    """Settings for authentication, loaded from environment variables."""

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 7200

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


authsettings = AuthSettings()

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    # Handle missing authentication header with consistent 401 status
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
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
        user = db.execute(stmt).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token") from None
