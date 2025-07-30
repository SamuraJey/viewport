import io

from tests.helpers import register_and_login


class TestPhotoAPI:
    def test_upload_photo_success(self, authenticated_client, gallery_id_fixture):
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["gallery_id"] == gallery_id_fixture
        assert data["file_size"] == len(file_content)
        assert data["url"]

    def test_upload_photo_too_large(self, authenticated_client, gallery_id_fixture):
        file_content = b"x" * (15 * 1024 * 1024 + 1)  # 15MB + 1 byte
        files = {"file": ("big.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert resp.status_code == 413
        assert resp.json()["detail"] == "File too large (max 15MB)"

    def test_upload_photo_unauth(self, client, gallery_id_fixture):
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        # Try upload without auth
        resp = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files)
        assert resp.status_code == 401 or resp.status_code == 403

    def test_upload_photo_wrong_gallery(self, client, gallery_id_fixture):
        # Create another user
        token2 = register_and_login(client, "user2@example.com", "pass23456")
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Try upload to first user's gallery as second user
        file_content = b"test image data"
        files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
        resp = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files, headers=headers2)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Gallery not found"
