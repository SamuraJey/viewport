"""Tests for photo API endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login, upload_photo_via_presigned


class TestPhotoAPI:
    """Test photo API endpoints with comprehensive coverage."""

    def test_upload_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test uploading photo to non-existent gallery."""
        fake_uuid = str(uuid4())
        image_content = b"fake image content"
        payload = {"files": [{"filename": "test.jpg", "file_size": len(image_content), "content_type": "image/jpeg"}]}

        response = authenticated_client.post(f"/galleries/{fake_uuid}/photos/batch-presigned", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test uploading photo to gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        image_content = b"fake image content"
        payload = {"files": [{"filename": "test.jpg", "file_size": len(image_content), "content_type": "image/jpeg"}]}

        response = client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_photo_not_found(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test deleting non-existent photo."""
        fake_photo_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting photo from non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_photo_unauthorized(self, client: TestClient):
        """Test deleting photo without authentication."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = client.delete(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}")
        assert response.status_code == 401

    def test_delete_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting photo from gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_photo_id = str(uuid4())
        response = client.delete(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_all_photo_urls_for_gallery_not_found(self, authenticated_client: TestClient):
        """Test getting URLs from a non-existent gallery."""
        fake_gallery_id = str(uuid4())
        response = authenticated_client.get(f"/galleries/{fake_gallery_id}/photos/urls")
        assert response.status_code == 404

    def test_get_all_photo_urls_for_gallery_unauthorized(self, client: TestClient):
        """Test getting URLs without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.get(f"/galleries/{fake_gallery_id}/photos/urls")
        assert response.status_code == 401

    def test_get_all_photo_urls_for_gallery_empty(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test getting URLs from a gallery with no photos."""
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/urls")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_all_photo_urls_for_gallery_different_user(self, client: TestClient, gallery_id_fixture: str):
        """Test getting URLs from another user's gallery."""
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        response = client.get(f"/galleries/{gallery_id_fixture}/photos/urls")
        assert response.status_code == 404

    def test_rename_photo_not_found(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test renaming non-existent photo."""
        fake_photo_id = str(uuid4())
        rename_data = {"filename": "renamed_photo.jpg"}
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}/rename", json=rename_data)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_rename_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test renaming photo in non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        rename_data = {"filename": "renamed_photo.jpg"}
        response = authenticated_client.patch(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}/rename", json=rename_data)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_rename_photo_unauthorized(self, client: TestClient):
        """Test renaming photo without authentication."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        rename_data = {"filename": "renamed_photo.jpg"}
        response = client.patch(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}/rename", json=rename_data)
        assert response.status_code == 401

    def test_rename_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test renaming photo in gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_photo_id = str(uuid4())
        rename_data = {"filename": "renamed_photo.jpg"}
        response = client.patch(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}/rename", json=rename_data)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_rename_photo_invalid_filename(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test renaming photo with invalid filename."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"fake image content", "test.jpg")

        # Try to rename with empty filename
        rename_data = {"filename": ""}
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename", json=rename_data)
        assert response.status_code == 422  # Validation error
