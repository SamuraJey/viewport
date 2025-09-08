"""Tests for photo API endpoints."""

import io
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login


class TestPhotoAPI:
    """Test photo API endpoints with comprehensive coverage."""

    def test_upload_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful photo upload."""
        # Create a fake image file
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert response.status_code == 201
        data = response.json()

        assert "id" in data
        assert "file_size" in data
        assert data["file_size"] == len(image_content)
        assert "uploaded_at" in data

    def test_upload_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test uploading photo to non-existent gallery."""
        fake_uuid = str(uuid4())
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = authenticated_client.post(f"/galleries/{fake_uuid}/photos", files=files)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_photo_unauthorized(self, client: TestClient):
        """Test uploading photo without authentication."""
        fake_gallery_id = str(uuid4())
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = client.post(f"/galleries/{fake_gallery_id}/photos", files=files)
        assert response.status_code == 401

    def test_upload_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test uploading photo to gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}

        response = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_photo_file_too_large(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test uploading photo that exceeds size limit."""
        # Create a file larger than 15MB
        large_content = b"x" * (16 * 1024 * 1024)  # 16MB
        files = {"file": ("large.jpg", io.BytesIO(large_content), "image/jpeg")}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert response.status_code == 413
        assert "file too large" in response.json()["detail"].lower()

    def test_upload_photo_no_file(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test uploading without providing a file."""
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos")
        assert response.status_code == 422

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

    def test_get_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test retrieving photo from gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_photo_id = str(uuid4())
        response = client.get(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photo_signed_url_endpoint(self, client: TestClient):
        """Test getting a signed URL for a photo."""
        # First, authenticate and upload a photo
        test_data = {"email": "signeduser@example.com", "password": "testpassword123"}
        client.post("/auth/register", json=test_data)
        login_response = client.post("/auth/login", json=test_data)
        user_token = login_response.json()["tokens"]["access_token"]

        client.headers.update({"Authorization": f"Bearer {user_token}"})

        # Create gallery for this user
        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Get signed URL
        response = client.get(f"/photos/auth/{photo_id}/url")
        assert response.status_code == 200
        signed_url = response.json()["url"]

        # The URL should be a valid presigned URL for the object storage
        assert signed_url.startswith("http")
        assert str(gallery_id) in signed_url
        assert "test.jpg" in signed_url

        # We can't `get` the minio url in a test without more extensive mocking.
        # So we just clear headers for any subsequent tests.
        client.headers.clear()

    def test_get_photo_url_auth_not_found(self, authenticated_client: TestClient):
        """Test getting a signed URL for a non-existent photo."""
        fake_photo_id = str(uuid4())
        response = authenticated_client.get(f"/photos/auth/{fake_photo_id}/url")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photo_url_auth_exception(self, authenticated_client: TestClient, gallery_id_fixture: str, mocker):
        """Test exception handling when generating a signed URL."""
        # Upload a photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Mock generate_presigned_url to raise an exception
        mocker.patch("src.viewport.api.photo.generate_presigned_url", side_effect=Exception("MinIO error"))

        response = authenticated_client.get(f"/photos/auth/{photo_id}/url")
        assert response.status_code == 500
        assert "failed to generate photo url" in response.json()["detail"].lower()

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
        assert response.status_code == 400
        assert "no files provided" in response.json()["detail"].lower()

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
        different_user_token = register_and_login(client, "different@example.com", "password123")
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
