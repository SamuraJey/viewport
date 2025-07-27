import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models.user import User
from ..schemas.auth import LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, RegisterResponse, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])


JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    user = User(
        id=uuid.uuid4(),
        email=request.email,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    return RegisterResponse(id=str(user.id), email=user.email)


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def login_user(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or user.password_hash != hash_password(request.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    return LoginResponse(id=str(user.id), email=user.email, tokens={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"})


@router.post("/refresh", response_model=TokenPair, status_code=status.HTTP_200_OK)
def refresh_token(request: RefreshRequest, db: Session = Depends(get_db)):
    try:
        # Decode and validate the refresh token
        payload = jwt.decode(request.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        token_type = payload.get("type")

        # Check if it's actually a refresh token
        if token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Check if user exists
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Generate new tokens
        new_access_token = create_access_token(str(user.id))
        new_refresh_token = create_refresh_token(str(user.id))

        return TokenPair(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
