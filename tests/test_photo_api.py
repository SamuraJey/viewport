"""Tests for photo API endpoints."""

import io
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from fastapi.testclient import TestClient

from src.viewport.api.auth import authsettings
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
        assert response.headers.get("cache-control") == "public, max-age=3600"
        assert response.headers.get("etag") == f'"{photo_id}"'

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

    def test_get_photo_with_token_success(self, client: TestClient, gallery_id_fixture: str):
        """Test retrieving photo using token-based auth."""
        # First, authenticate and upload a photo
        test_data = {"email": "tokenuser@example.com", "password": "testpassword123"}
        client.post("/auth/register", json=test_data)
        login_response = client.post("/auth/login", json=test_data)
        user_token = login_response.json()["tokens"]["access_token"]
        user_id = login_response.json()["id"]
        
        client.headers.update({"Authorization": f"Bearer {user_token}"})
        
        # Create gallery for this user
        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]
        
        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Create photo access token
        payload = {
            "user_id": user_id,
            "photo_id": photo_id,
            "exp": datetime.now(UTC) + timedelta(hours=1)
        }
        photo_token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)

        # Clear auth header and use token parameter
        client.headers.clear()
        response = client.get(f"/photos/auth/{photo_id}?token={photo_token}")
        assert response.status_code == 200
        assert response.headers.get("cache-control") == "public, max-age=86400"

    def test_get_photo_with_invalid_token(self, client: TestClient):
        """Test retrieving photo with invalid token."""
        fake_photo_id = str(uuid4())
        response = client.get(f"/photos/auth/{fake_photo_id}?token=invalid_token")
        assert response.status_code == 403
        assert "invalid" in response.json()["detail"].lower()

    def test_get_photo_with_token_photo_mismatch(self, client: TestClient):
        """Test retrieving photo with token for different photo."""
        # Create a valid token for one photo but try to access another
        photo_id_1 = str(uuid4())
        photo_id_2 = str(uuid4())
        user_id = str(uuid4())
        
        payload = {
            "user_id": user_id,
            "photo_id": photo_id_1,
            "exp": datetime.now(UTC) + timedelta(hours=1)
        }
        token = jwt.encode(payload, authsettings.jwt_secret_key, algorithm=authsettings.jwt_algorithm)

        response = client.get(f"/photos/auth/{photo_id_2}?token={token}")
        assert response.status_code == 403
        assert "invalid token" in response.json()["detail"].lower()

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
