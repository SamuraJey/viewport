"""Tests for photo API endpoints."""

import io
from urllib.parse import parse_qs, urlparse
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

    def test_get_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful photo retrieval."""
        # First upload a photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert upload_response.status_code == 201
        photo_id = upload_response.json()["id"]

        # Then retrieve it
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{photo_id}")
        assert response.status_code == 200
        assert response.json()["id"] == photo_id
        assert response.json()["file_size"] == len(image_content)
        assert "uploaded_at" in response.json()

    def test_get_photo_not_found(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test retrieving non-existent photo."""
        fake_photo_id = str(uuid4())
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test retrieving photo from non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = authenticated_client.get(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photo_unauthorized(self, client: TestClient):
        """Test retrieving photo without authentication."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = client.get(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}")
        assert response.status_code == 401

    def test_get_photo_different_user_gallery(self, client: TestClient, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test getting photo from gallery owned by different user."""
        # First, upload a photo as authenticated user
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert upload_response.status_code == 201
        assert upload_response.json()["id"]

        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

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

    def test_delete_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful photo deletion."""
        # Upload a photo first
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert upload_response.status_code == 201
        photo_id = upload_response.json()["id"]

        # Delete the photo
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/photos/{photo_id}")
        assert response.status_code == 204

        # Verify photo is deleted
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{photo_id}")
        assert response.status_code == 404

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

    def test_photo_isolation_between_galleries(self, authenticated_client: TestClient):
        """Test that photos are properly isolated between galleries."""
        # Create two galleries
        gallery1_response = authenticated_client.post("/galleries/", json={})
        gallery1_id = gallery1_response.json()["id"]

        gallery2_response = authenticated_client.post("/galleries/", json={})
        gallery2_id = gallery2_response.json()["id"]

        # Upload photo to gallery 1
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery1_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Try to access photo through gallery 2 - should fail
        response = authenticated_client.get(f"/galleries/{gallery2_id}/photos/{photo_id}")
        assert response.status_code == 404

        # Try to delete photo through gallery 2 - should fail
        response = authenticated_client.delete(f"/galleries/{gallery2_id}/photos/{photo_id}")
        assert response.status_code == 404

        # Verify photo still exists in gallery 1
        response = authenticated_client.get(f"/galleries/{gallery1_id}/photos/{photo_id}")
        assert response.status_code == 200

    def test_get_all_photo_urls_for_gallery_success(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        """Test getting all photo URLs for a gallery successfully."""
        contents = [b"content1", b"content2"]

        authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos",
            files={"file": ("photo1.jpg", contents[0], "image/jpeg")},
        )
        authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos",
            files={"file": ("photo2.jpg", contents[1], "image/jpeg")},
        )

        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/urls")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

        required_params = {"X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Signature"}

        for i, item in enumerate(data):
            assert "gallery_id" in item
            assert item["gallery_id"] == gallery_id_fixture

            assert "url" in item
            url = item["url"]
            assert url.startswith("http")

            parsed = urlparse(url)
            qs = parse_qs(parsed.query)
            for param in required_params:
                assert param in qs, f"Missing {param} in presigned URL: {url}"

            assert "file_size" in item
            assert item["file_size"] == len(contents[i])

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

    def test_rename_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful photo rename."""
        # First upload a photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert upload_response.status_code == 201
        photo_id = upload_response.json()["id"]

        # Rename the photo
        rename_data = {"filename": "renamed_photo.jpg"}
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename", json=rename_data)
        assert response.status_code == 200

        data = response.json()
        assert data["filename"] == "renamed_photo.jpg"
        assert data["id"] == photo_id
        assert data["gallery_id"] == gallery_id_fixture

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
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert upload_response.status_code == 201
        photo_id = upload_response.json()["id"]

        # Try to rename with empty filename
        rename_data = {"filename": ""}
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename", json=rename_data)
        assert response.status_code == 422  # Validation error
