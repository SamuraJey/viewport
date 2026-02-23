import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from viewport.auth_utils import authsettings
from viewport.models.db import get_db
from viewport.repositories.user_repository import UserRepository
from viewport.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, RegisterResponse, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])

# A dummy hash to use when the user is not found, to prevent timing attacks
DUMMY_HASH = "$2b$12$t1mLmH3zKxUqFT8nM5cUHO4tbsrgn90vkUwJW09eORUeBLst9.YFC"


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
async def register_user(request: RegisterRequest, repo: UserRepository = Depends(get_user_repository)):
    # Verify invite code
    if request.invite_code != authsettings.invite_code:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    # Run CPU-bound bcrypt in a separate thread to avoid blocking the event loop
    hashed_password = await asyncio.to_thread(hash_password, request.password)

    try:
        # Run synchronous DB operation in a separate thread
        user = await asyncio.to_thread(repo.create_user, request.email, hashed_password)
    except IntegrityError as err:
        raise HTTPException(status_code=400, detail="Email already registered") from err
    return RegisterResponse(id=str(user.id), email=user.email)


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login_user(request: LoginRequest, repo: UserRepository = Depends(get_user_repository)):
    # Run synchronous DB operation in a separate thread
    user = await asyncio.to_thread(repo.get_user_by_email, request.email)

    if not user:
        # Prevent timing attacks by hashing a dummy password
        await asyncio.to_thread(verify_password, request.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Run CPU-bound bcrypt in a separate thread to avoid blocking the event loop
    is_valid = await asyncio.to_thread(verify_password, request.password, user.password_hash)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    return LoginResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        storage_used=user.storage_used,
        storage_quota=user.storage_quota,
        tokens={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"},
    )


@router.post("/refresh", response_model=TokenPair, status_code=status.HTTP_200_OK)
async def refresh_token(request: RefreshRequest, repo: UserRepository = Depends(get_user_repository)):
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
        user = await asyncio.to_thread(repo.get_user_by_id, uuid.UUID(user_id))
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
