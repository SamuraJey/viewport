import io
import pytest
from fastapi.testclient import TestClient
from src.app.main import app
from src.app.models.gallery import Gallery
from src.app.models.gallery import Photo


@pytest.fixture(scope="function")
def client(setup_db):
    return TestClient(app)


class TestPhotoAPI:
    def setup_gallery(self, client):
        # Register and login
        reg_payload = {"email": "photo@example.com", "password": "photopass123"}
        client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        # Create gallery
        gallery_resp = client.post("/galleries", json={}, headers=headers)
        gallery_id = gallery_resp.json()["id"]
        return headers, gallery_id

    def test_upload_photo_success(self, client):
        headers, gallery_id = self.setup_gallery(client)
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["gallery_id"] == gallery_id
        assert data["file_size"] == len(file_content)
        assert data["url_s3"]

    def test_upload_photo_too_large(self, client):
        headers, gallery_id = self.setup_gallery(client)
        file_content = b"x" * (15 * 1024 * 1024 + 1)  # 15MB + 1 byte
        files = {"file": ("big.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)
        assert resp.status_code == 413
        assert resp.json()["detail"] == "File too large (max 15MB)"

    def test_upload_photo_unauth(self, client):
        # Create gallery as user
        headers, gallery_id = self.setup_gallery(client)
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        # Try upload without auth
        resp = client.post(f"/galleries/{gallery_id}/photos", files=files)
        assert resp.status_code == 401 or resp.status_code == 403

    def test_upload_photo_wrong_gallery(self, client):
        # Register/login as user1, create gallery
        reg_payload1 = {"email": "user1@example.com", "password": "pass12345"}
        client.post("/auth/register", json=reg_payload1)
        login_resp1 = client.post("/auth/login", json=reg_payload1)
        print("login_resp1.status_code:", login_resp1.status_code)
        print("login_resp1.json():", login_resp1.json())
        token1 = login_resp1.json()["tokens"]["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}
        gallery_resp = client.post("/galleries", json={}, headers=headers1)
        gallery_id = gallery_resp.json()["id"]
        # Register/login as user2
        reg_payload2 = {"email": "user2@example.com", "password": "pass23456"}
        client.post("/auth/register", json=reg_payload2)
        login_resp2 = client.post("/auth/login", json=reg_payload2)
        token2 = login_resp2.json()["tokens"]["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        # Try upload to user1's gallery as user2
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers2)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Gallery not found"
