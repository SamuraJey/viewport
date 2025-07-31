"""Tests for authentication API endpoints."""

import pytest
from fastapi.testclient import TestClient


class TestAuthAPI:
    """Test authentication API endpoints with comprehensive coverage."""

    @pytest.mark.parametrize(
        "user_data",
        [
            {"email": "test1@example.com", "password": "password123"},
            {"email": "test2@example.com", "password": "verylongpassword12345"},
            {"email": "user.with.dots@example.com", "password": "password123"},
            {"email": "user+tag@example.com", "password": "password123"},
        ],
    )
    def test_register_success(self, client: TestClient, user_data):
        """Test successful user registration with various valid inputs."""
        response = client.post("/auth/register", json=user_data)
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == user_data["email"]
        assert "id" in data

    @pytest.mark.parametrize(
        "invalid_data,expected_status",
        [
            ({"email": "invalid-email", "password": "password123"}, 422),
            ({"email": "test@example.com", "password": "short"}, 422),
            ({"email": "test@example.com", "password": ""}, 422),
            ({"email": "", "password": "password123"}, 422),
            ({"email": "test@example.com"}, 422),  # Missing password
            ({"password": "password123"}, 422),  # Missing email
            ({}, 422),  # Empty payload
        ],
    )
    def test_register_validation_errors(self, client: TestClient, invalid_data, expected_status):
        """Test registration with various invalid inputs."""
        response = client.post("/auth/register", json=invalid_data)
        assert response.status_code == expected_status

    def test_register_duplicate_email(self, client: TestClient, test_user_data):
        """Test registration with duplicate email."""
        # First registration should succeed
        response1 = client.post("/auth/register", json=test_user_data)
        assert response1.status_code == 201

        # Second registration should fail
        response2 = client.post("/auth/register", json=test_user_data)
        assert response2.status_code == 400
        assert response2.json()["detail"] == "Email already registered"

    def test_login_success(self, client: TestClient, test_user_data):
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
    def test_login_various_errors(self, client: TestClient, test_user_data, login_data, expected_status):
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
        user_data = {"email": "flow@example.com", "password": "flowpassword123"}

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
