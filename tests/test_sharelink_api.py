"""Tests for sharelink API endpoints."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login


class TestSharelinkAPI:
    """Test sharelink API endpoints with comprehensive coverage."""

    def test_create_sharelink_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful sharelink creation."""
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": gallery_id_fixture}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "gallery_id" in data
        assert data["gallery_id"] == gallery_id_fixture
        assert "expires_at" in data
        assert "created_at" in data
        assert data["views"] == 0
        assert data["single_downloads"] == 0
        assert data["zip_downloads"] == 0

    def test_create_sharelink_no_expiration(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink without expiration date."""
        payload = {"expires_at": None, "gallery_id": gallery_id_fixture}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["expires_at"] is None

    def test_create_sharelink_gallery_not_found(self, authenticated_client: TestClient):
        """Test creating sharelink for non-existent gallery."""
        fake_uuid = str(uuid4())
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": fake_uuid}

        response = authenticated_client.post(f"/galleries/{fake_uuid}/share-links", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_sharelink_unauthorized(self, client: TestClient):
        """Test creating sharelink without authentication."""
        # Use a fake gallery ID that doesn't exist
        fake_gallery_id = str(uuid4())
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": fake_gallery_id}

        response = client.post(f"/galleries/{fake_gallery_id}/share-links", json=payload)
        assert response.status_code == 401

    def test_create_sharelink_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink for gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": gallery_id_fixture}

        response = client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_sharelink_invalid_expiration(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink with invalid expiration date format."""
        payload = {"expires_at": "invalid-date", "gallery_id": gallery_id_fixture}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 422

    def test_delete_sharelink_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful sharelink deletion."""
        # Create a sharelink first
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": gallery_id_fixture}

        create_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert create_response.status_code == 201
        sharelink_id = create_response.json()["id"]

        # Delete the sharelink
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}")
        assert response.status_code == 204

    def test_delete_sharelink_not_found(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test deleting non-existent sharelink."""
        fake_sharelink_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_sharelink_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting sharelink from non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_sharelink_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{fake_gallery_id}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_sharelink_unauthorized(self, client: TestClient):
        """Test deleting sharelink without authentication."""
        fake_gallery_id = str(uuid4())
        fake_sharelink_id = str(uuid4())
        response = client.delete(f"/galleries/{fake_gallery_id}/share-links/{fake_sharelink_id}")
        assert response.status_code == 401

    def test_delete_sharelink_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting sharelink from gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_sharelink_id = str(uuid4())
        response = client.delete(f"/galleries/{gallery_id_fixture}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_multiple_sharelinks_per_gallery(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating multiple sharelinks for the same gallery."""
        sharelink_ids = []
        for i in range(3):
            expires_at = (datetime.now(UTC) + timedelta(days=i + 1)).isoformat()
            payload = {"expires_at": expires_at, "gallery_id": gallery_id_fixture}

            response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
            assert response.status_code == 201
            sharelink_ids.append(response.json()["id"])

        # Verify all sharelinks are unique
        assert len(set(sharelink_ids)) == 3

        # Delete one sharelink
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_ids[0]}")
        assert response.status_code == 204

        # Verify other sharelinks still exist by attempting to delete them
        for sharelink_id in sharelink_ids[1:]:
            response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}")
            assert response.status_code == 204
