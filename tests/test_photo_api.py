"""Tests for photo API endpoints."""

import io
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login


class TestPhotoAPI:
    """Test photo API endpoints with comprehensive coverage."""

    def test_upload_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test uploading photo to non-existent gallery."""
        fake_uuid = str(uuid4())
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = authenticated_client.post(f"/galleries/{fake_uuid}/photos", files=files)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test uploading photo to gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photo_url_auth_not_found(self, authenticated_client: TestClient):
        """Test getting a signed URL for a non-existent photo."""
        fake_photo_id = str(uuid4())
        response = authenticated_client.get(f"/photos/auth/{fake_photo_id}/url")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_photos_batch_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful batch photo upload."""
        files = [
            ("files", ("photo1.jpg", b"content1", "image/jpeg")),
            ("files", ("photo2.png", b"content2", "image/png")),
        ]
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["total_files"] == 2
        assert data["successful_uploads"] == 2
        assert data["failed_uploads"] == 0
        assert len(data["results"]) == 2
        assert data["results"][0]["success"] is True
        assert data["results"][1]["success"] is True

    def test_upload_photos_batch_partial_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test batch upload with some files too large."""
        large_content = b"x" * (16 * 1024 * 1024)  # 16MB
        files = [
            ("files", ("photo1.jpg", b"content1", "image/jpeg")),
            ("files", ("large_photo.jpg", large_content, "image/jpeg")),
        ]
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["total_files"] == 2
        assert data["successful_uploads"] == 1
        assert data["failed_uploads"] == 1
        assert len(data["results"]) == 2
        assert data["results"][0]["success"] is True
        assert data["results"][1]["success"] is False
        assert "file too large" in data["results"][1]["error"].lower()

    def test_upload_photos_batch_gallery_not_found(self, authenticated_client: TestClient):
        """Test batch uploading to a non-existent gallery."""
        fake_gallery_id = str(uuid4())
        files = [("files", ("photo1.jpg", b"content1", "image/jpeg"))]
        response = authenticated_client.post(f"/galleries/{fake_gallery_id}/photos/batch", files=files)
        assert response.status_code == 404

    def test_upload_photos_batch_unauthorized(self, client: TestClient):
        """Test batch uploading without authentication."""
        fake_gallery_id = str(uuid4())
        files = [("files", ("photo1.jpg", b"content1", "image/jpeg"))]
        response = client.post(f"/galleries/{fake_gallery_id}/photos/batch", files=files)
        assert response.status_code == 401

    def test_upload_photos_batch_no_files(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test batch uploading with no files."""
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch")
        assert response.status_code == 422  # because files is required and fastapi returns 422 in this case
        assert "Field required".lower() in str(response.json()["detail"]).lower()

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
        # First upload a photo
        image_content = b"fake image content"
        files = {"files": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch", files=files)
        assert upload_response.status_code == 200
        photo_id = upload_response.json()["results"][0]["photo"]["id"]

        # Try to rename with empty filename
        rename_data = {"filename": ""}
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename", json=rename_data)
        assert response.status_code == 422  # Validation error
