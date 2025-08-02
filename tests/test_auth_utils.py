"""Tests for auth_utils module."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from src.viewport.auth_utils import get_current_user
from src.viewport.models.user import User

JWT_ALGORITHM = "HS256"
JWT_SECRET = "keks"

class TestJWTAuthentication:
    """Test JWT token handling and user authentication."""

    @pytest.fixture(autouse=True)
    def patch_authsettings(self, monkeypatch):
        # Patch authsettings.jwt_secret_key and jwt_algorithm to match test values
        from src.viewport import auth_utils
        monkeypatch.setattr(auth_utils.authsettings, "jwt_secret_key", JWT_SECRET)
        monkeypatch.setattr(auth_utils.authsettings, "jwt_algorithm", JWT_ALGORITHM)

    @pytest.mark.parametrize(
        "user_id",
        [
            "dfd59dec-2db6-47dd-b988-218d695bf22a",
            "ce620d4e-636b-4755-a043-57b6456a4d5e",
            "e678abe2-7b7a-4173-ab2c-855681542c0e",
        ],
    )
    def test_get_current_user_valid_token(self, db_session, user_id):
        """Test getting current user with valid token."""
        # Create a user in the database
        user = User(id=uuid.UUID(user_id), email="test@example.com", password_hash="hashed_password")
        db_session.add(user)
        db_session.commit()

        # Create a valid token
        payload = {"sub": user_id}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        # Mock credentials
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        # Test get_current_user
        result = get_current_user(credentials, db_session)
        assert result.id == uuid.UUID(user_id)
        assert result.email == "test@example.com"

    def test_get_current_user_no_user_id_in_token(self, db_session):
        """Test token without user ID."""
        # Create token without 'sub' field
        payload = {"name": "test"}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    def test_get_current_user_user_not_found(self, db_session):
        """Test token with non-existent user ID."""
        non_existent_user_id = str(uuid.uuid4())
        payload = {"sub": non_existent_user_id}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "User not found"

    def test_get_current_user_expired_token(self, db_session):
        """Test expired token."""
        user_id = str(uuid.uuid4())
        expired_payload = {
            "sub": user_id,
            "exp": datetime.now(UTC) - timedelta(hours=1),  # Expired 1 hour ago
        }
        token = jwt.encode(expired_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Token expired"

    @pytest.mark.parametrize(
        "invalid_token",
        [
            "invalid.token.here",
            "notajwt",
            "",
            "Bearer invalid",
            "completely_wrong_format",
        ],
    )
    def test_get_current_user_invalid_token_format(self, db_session, invalid_token):
        """Test various invalid token formats."""
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=invalid_token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    def test_get_current_user_wrong_secret(self, db_session):
        """Test token signed with wrong secret."""
        user_id = str(uuid.uuid4())
        payload = {"sub": user_id}
        # Sign with wrong secret
        token = jwt.encode(payload, "wrong_secret", algorithm=JWT_ALGORITHM)

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    def test_get_current_user_wrong_algorithm(self, db_session):
        """Test token signed with wrong algorithm."""
        user_id = str(uuid.uuid4())
        payload = {"sub": user_id}
        # Sign with wrong algorithm
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS512")

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials, db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"



