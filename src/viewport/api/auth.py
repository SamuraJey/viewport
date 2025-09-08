import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.viewport.db import get_db
from src.viewport.repositories.user_repository import UserRepository
from src.viewport.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, RegisterResponse, TokenPair
from viewport.auth_utils import authsettings

router = APIRouter(prefix="/auth", tags=["auth"])


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with a random salt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(UTC) + timedelta(minutes=authsettings.access_token_expire_minutes), "type": "access"}
    return jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(UTC) + timedelta(minutes=authsettings.refresh_token_expire_minutes), "type": "refresh"}
    return jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, repo: UserRepository = Depends(get_user_repository)):
    try:
        user = repo.create_user(request.email, hash_password(request.password))
    except IntegrityError as err:
        raise HTTPException(status_code=400, detail="Email already registered") from err
    return RegisterResponse(id=str(user.id), email=user.email)


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def login_user(request: LoginRequest, repo: UserRepository = Depends(get_user_repository)):
    user = repo.get_user_by_email(request.email)
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    return LoginResponse(id=str(user.id), email=user.email, tokens={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"})


@router.post("/refresh", response_model=TokenPair, status_code=status.HTTP_200_OK)
def refresh_token(request: RefreshRequest, repo: UserRepository = Depends(get_user_repository)):
    try:
        # Decode and validate the refresh token
        payload = jwt.decode(request.refresh_token, authsettings.jwt_secret_key, algorithms=[authsettings.jwt_algorithm])
        user_id = payload.get("sub")
        token_type = payload.get("type")

        # Check if it's actually a refresh token
        if token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Check if user exists
        user = repo.get_user_by_id(uuid.UUID(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Generate new tokens
        new_access_token = create_access_token(str(user.id))
        new_refresh_token = create_refresh_token(str(user.id))

        return TokenPair(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None
