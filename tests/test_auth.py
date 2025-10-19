"""Tests for authentication API endpoints."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module", autouse=True)
def auth_settings():
    """Fixture providing AuthSettings for tests."""
    from viewport.auth_utils import AuthSettings

    return AuthSettings()


class TestAuthAPI:
    """Test authentication API endpoints with comprehensive coverage."""

    @pytest.mark.parametrize(
        "user_data",
        [
            {"email": "test1@example.com", "password": "password123", "invite_code": "testinvitecode"},
            {"email": "test2@example.com", "password": "verylongpassword12345", "invite_code": "testinvitecode"},
            {"email": "user.with.dots@example.com", "password": "password123", "invite_code": "testinvitecode"},
            {"email": "user+tag@example.com", "password": "password123", "invite_code": "testinvitecode"},
        ],
    )
    def test_register_success(self, client: TestClient, user_data, auth_settings):
        """Test successful user registration with various valid inputs."""
        response = client.post("/auth/register", json=user_data)
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == user_data["email"]
        assert "id" in data

    @pytest.mark.parametrize(
        "invalid_data,expected_status",
        [
            ({"email": "invalid-email", "password": "password123", "invite_code": "testinvitecode"}, 422),
            ({"email": "test@example.com", "password": "short", "invite_code": "testinvitecode"}, 422),
            ({"email": "test@example.com", "password": "", "invite_code": "testinvitecode"}, 422),
            ({"email": "", "password": "password123", "invite_code": "testinvitecode"}, 422),
            ({"email": "test@example.com", "invite_code": "testinvitecode"}, 422),  # Missing password
            ({"password": "password123", "invite_code": "testinvitecode"}, 422),  # Missing email
            ({"email": "test@example.com", "password": "password123"}, 422),  # Missing invite_code
            ({"email": "test@example.com", "password": "password123", "invite_code": ""}, 422),  # Empty invite_code
            ({}, 422),  # Empty payload
        ],
    )
    def test_register_validation_errors(self, client: TestClient, invalid_data, expected_status, auth_settings):
        """Test registration with various invalid inputs."""
        response = client.post("/auth/register", json=invalid_data)
        assert response.status_code == expected_status

    def test_register_invalid_invite_code(self, client: TestClient, auth_settings):
        """Test registration with invalid invite code."""
        user_data = {"email": "test@example.com", "password": "password123", "invite_code": "wrongcode"}
        response = client.post("/auth/register", json=user_data)
        assert response.status_code == 403
        assert response.json()["detail"] == "Invalid invite code"

    def test_register_duplicate_email(self, client: TestClient, test_user_data, auth_settings):
        """Test registration with duplicate email."""
        # First registration should succeed
        response1 = client.post("/auth/register", json=test_user_data)
        assert response1.status_code == 201

        # Second registration should fail
        response2 = client.post("/auth/register", json=test_user_data)
        assert response2.status_code == 400
        assert response2.json()["detail"] == "Email already registered"

    def test_login_success(self, client: TestClient, test_user_data, auth_settings):
        """Test successful login."""
        # Register user first
        client.post("/auth/register", json=test_user_data)

        # Login
        response = client.post("/auth/login", json=test_user_data)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user_data["email"]
        assert "id" in data
        assert "tokens" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]

    @pytest.mark.parametrize(
        "login_data,expected_status",
        [
            ({"email": "nonexistent@example.com", "password": "password123"}, 401),
            ({"email": "test@example.com", "password": "wrongpassword"}, 401),
            ({"email": "invalid-email", "password": "password123"}, 422),
            ({"email": "test@example.com", "password": "short"}, 422),
            ({"email": "test@example.com"}, 422),  # Missing password
            ({"password": "password123"}, 422),  # Missing email
            ({}, 422),  # Empty payload
        ],
    )
    def test_login_various_errors(self, client: TestClient, test_user_data, login_data, expected_status, auth_settings):
        """Test login with various error scenarios."""
        # Register a valid user first for wrong password test
        if login_data.get("email") == "test@example.com":
            client.post("/auth/register", json=test_user_data)

        response = client.post("/auth/login", json=login_data)
        assert response.status_code == expected_status


class TestAuthFlow:
    """Test complete authentication flows."""

    def test_complete_auth_flow(self, client: TestClient):
        """Test complete registration -> login -> access protected endpoint flow."""
        user_data = {"email": "flow@example.com", "password": "flowpassword123", "invite_code": "testinvitecode"}

        # Step 1: Register
        reg_response = client.post("/auth/register", json=user_data)
        assert reg_response.status_code == 201
        user_id = reg_response.json()["id"]

        # Step 2: Login
        login_response = client.post("/auth/login", json=user_data)
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["id"] == user_id
        token = login_data["tokens"]["access_token"]

        # Step 3: Access protected endpoint
        headers = {"Authorization": f"Bearer {token}"}
        me_response = client.get("/me", headers=headers)
        assert me_response.status_code == 200
        me_data = me_response.json()
        assert me_data["id"] == user_id
        assert me_data["email"] == user_data["email"]

    def test_multiple_users_independent(self, client: TestClient, multiple_users_data):
        """Test multiple users can register and login independently."""
        tokens = []

        for user_data in multiple_users_data:
            # Register user
            reg_response = client.post("/auth/register", json=user_data)
            assert reg_response.status_code == 201

            # Login user
            login_response = client.post("/auth/login", json=user_data)
            assert login_response.status_code == 200
            token = login_response.json()["tokens"]["access_token"]
            tokens.append(token)

            # Verify access to protected endpoint
            headers = {"Authorization": f"Bearer {token}"}
            me_response = client.get("/me", headers=headers)
            assert me_response.status_code == 200
            assert me_response.json()["email"] == user_data["email"]

        # All tokens should be different
        assert len(set(tokens)) == len(tokens)

    def test_refresh_token_success(self, client: TestClient, test_user_data):
        """Test successful token refresh."""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_data)

        tokens = login_response.json()["tokens"]
        refresh_token = tokens["refresh_token"]
        original_access_token = tokens["access_token"]

        # Add small delay to ensure different timestamps
        import time

        time.sleep(1)

        # Refresh token
        refresh_payload = {"refresh_token": refresh_token}
        refresh_response = client.post("/auth/refresh", json=refresh_payload)

        assert refresh_response.status_code == 200
        new_tokens = refresh_response.json()
        assert "access_token" in new_tokens
        assert "refresh_token" in new_tokens
        assert "token_type" in new_tokens
        assert new_tokens["token_type"] == "bearer"

        # New tokens should be different from original (due to different timestamps)
        assert new_tokens["access_token"] != original_access_token
        assert new_tokens["refresh_token"] != refresh_token

    def test_refresh_token_invalid_token(self, client: TestClient):
        """Test refresh with invalid token."""
        refresh_payload = {"refresh_token": "invalid_token"}
        response = client.post("/auth/refresh", json=refresh_payload)
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    def test_refresh_token_access_token_used(self, client: TestClient, test_user_data):
        """Test refresh endpoint rejects access tokens."""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_data)

        # Try to use access token for refresh
        access_token = login_response.json()["tokens"]["access_token"]
        refresh_payload = {"refresh_token": access_token}
        response = client.post("/auth/refresh", json=refresh_payload)

        assert response.status_code == 401
        assert "invalid token type" in response.json()["detail"].lower()

    def test_refresh_token_expired(self, client: TestClient, auth_settings):
        """Test refresh with expired token."""
        # Create expired refresh token
        expired_payload = {"sub": "fake_user_id", "exp": datetime.now(UTC) - timedelta(days=1), "type": "refresh"}
        expired_token = jwt.encode(expired_payload, auth_settings.jwt_secret_key, algorithm=auth_settings.jwt_algorithm)

        refresh_payload = {"refresh_token": expired_token}
        response = client.post("/auth/refresh", json=refresh_payload)

        assert response.status_code == 401
        assert "expired" in response.json()["detail"].lower()

    def test_refresh_token_nonexistent_user(self, client: TestClient, auth_settings):
        """Test refresh with token for non-existent user."""
        # Create refresh token for non-existent user
        fake_payload = {"sub": str(uuid4()), "exp": datetime.now(UTC) + timedelta(days=1), "type": "refresh"}
        fake_token = jwt.encode(fake_payload, auth_settings.jwt_secret_key, algorithm=auth_settings.jwt_algorithm)

        refresh_payload = {"refresh_token": fake_token}
        response = client.post("/auth/refresh", json=refresh_payload)

        assert response.status_code == 401
        assert "user not found" in response.json()["detail"].lower()

    def test_refresh_token_malformed_payload(self, client: TestClient):
        """Test refresh endpoint with malformed request."""
        # Missing refresh_token field
        response = client.post("/auth/refresh", json={})
        assert response.status_code == 422

        # Wrong field name
        response = client.post("/auth/refresh", json={"token": "some_token"})
        assert response.status_code == 422

    def test_password_hashing_works(self, client: TestClient):
        """Test that passwords are properly hashed and not stored in plaintext."""
        from viewport.api.auth import hash_password, verify_password

        password = "test_password_123"
        hashed = hash_password(password)

        # Hash should be different from original password
        assert hashed != password

        # Should be able to verify the password
        assert verify_password(password, hashed) is True

        # Wrong password should not verify
        assert verify_password("wrong_password", hashed) is False

        # Same password should produce different hashes (due to salt)
        hashed2 = hash_password(password)
        assert hashed != hashed2
        assert verify_password(password, hashed2) is True

    def test_token_contains_correct_user_id(self, client: TestClient, test_user_data, auth_settings):
        """Test that generated tokens contain the correct user ID."""
        # Register and login
        reg_response = client.post("/auth/register", json=test_user_data)
        user_id = reg_response.json()["id"]

        login_response = client.post("/auth/login", json=test_user_data)
        tokens = login_response.json()["tokens"]

        # Decode access token and verify user ID
        access_payload = jwt.decode(tokens["access_token"], auth_settings.jwt_secret_key, algorithms=[auth_settings.jwt_algorithm])
        assert access_payload["sub"] == user_id
        assert access_payload["type"] == "access"

        # Decode refresh token and verify user ID
        refresh_payload = jwt.decode(tokens["refresh_token"], auth_settings.jwt_secret_key, algorithms=[auth_settings.jwt_algorithm])
        assert refresh_payload["sub"] == user_id
        assert refresh_payload["type"] == "refresh"
