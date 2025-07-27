from datetime import UTC, datetime, timedelta

from src.viewport.main import app


class TestPublicAPI:
    def setup_sharelink(self, client, expires_delta_days=1):
        reg_payload = {"email": "public@example.com", "password": "publicpass123"}
        client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        gallery_resp = client.post("/galleries", json={}, headers=headers)
        gallery_id = gallery_resp.json()["id"]
        expires = (datetime.now(UTC) + timedelta(days=expires_delta_days)).isoformat()
        share_payload = {"gallery_id": gallery_id, "expires_at": expires}
        share_resp = client.post(f"/galleries/{gallery_id}/share-links", json=share_payload, headers=headers)
        share_id = share_resp.json()["id"]
        return share_id, gallery_id, headers

    def test_get_photos_by_sharelink_success(self, client):
        share_id, gallery_id, headers = self.setup_sharelink(client)
        # Upload photo
        file_content = b"test image data"
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)
        # Public access
        resp = client.get(f"/s/{share_id}")
        assert resp.status_code == 200
        data = resp.json()["photos"]
        assert len(data) == 1
        assert "photo_id" in data[0]
        assert "thumbnail_url" in data[0]
        assert "full_url" in data[0]

    def test_get_photos_by_sharelink_expired(self, client):
        # Create an expired sharelink (expires 1 day in the past)
        share_id, gallery_id, headers = self.setup_sharelink(client, expires_delta_days=-1)

        # Upload photo to the gallery
        file_content = b"test image data"
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)

        # Try to access the expired sharelink - should return 404
        resp = client.get(f"/s/{share_id}")
        assert resp.status_code == 404
        assert "expired" in resp.json()["detail"].lower()

    def test_get_photos_by_sharelink_not_found(self, client):
        # Try to access a non-existent sharelink
        fake_uuid = "12345678-1234-1234-1234-123456789012"
        resp = client.get(f"/s/{fake_uuid}")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_single_photo_by_sharelink(self, client):
        """Test accessing individual photos via public share link"""
        share_id, gallery_id, headers = self.setup_sharelink(client)

        # Upload photo
        file_content = b"test image data"
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        photo_resp = client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)
        photo_id = photo_resp.json()["id"]

        # Access photo via public share link
        resp = client.get(f"/s/{share_id}/photos/{photo_id}")
        assert resp.status_code == 200
        assert resp.content == file_content
        assert resp.headers["content-type"].startswith("image/jpeg")

    def test_get_single_photo_by_sharelink_not_found(self, client):
        """Test accessing non-existent photo via share link"""
        share_id, gallery_id, headers = self.setup_sharelink(client)
        fake_photo_id = "12345678-1234-1234-1234-123456789012"

        resp = client.get(f"/s/{share_id}/photos/{fake_photo_id}")
        assert resp.status_code == 404
