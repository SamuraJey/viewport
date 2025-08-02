"""Tests for public API endpoints (sharelinks)."""

import io
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.helpers import register_and_login


@pytest.mark.skip(reason="Skipping public API tests as they are not implemented yet")
class TestPublicAPI:
    """Test public API endpoints with comprehensive coverage."""

    def test_get_photos_by_sharelink_not_found(self, client: TestClient):
        """Test accessing a non-existent sharelink."""
        fake_uuid = str(uuid4())
        response = client.get(f"/s/{fake_uuid}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_photos_by_sharelink_success(self, client: TestClient):
        """Test successful access to sharelink with photos."""
        # Create user, gallery, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        # Create gallery
        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photos
        photo_ids = []
        for i in range(3):
            image_content = f"fake image content {i}".encode()
            files = {"file": (f"test{i}.jpg", io.BytesIO(image_content), "image/jpeg")}
            upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
            assert upload_response.status_code == 201
            photo_ids.append(upload_response.json()["id"])

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": gallery_id}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        assert sharelink_response.status_code == 201
        share_id = sharelink_response.json()["id"]

        # Clear auth headers for public access
        client.headers.clear()

        # Access sharelink
        response = client.get(f"/s/{share_id}")
        assert response.status_code == 200
        data = response.json()
        assert "photos" in data
        assert len(data["photos"]) == 3

        # Verify photo URLs are correctly formatted
        for photo in data["photos"]:
            assert "photo_id" in photo
            assert photo["photo_id"] in photo_ids
            assert photo["thumbnail_url"] == f"/s/{share_id}/photos/{photo['photo_id']}"
            assert photo["full_url"] == f"/s/{share_id}/photos/{photo['photo_id']}"

    def test_get_photos_by_sharelink_empty_gallery(self, client: TestClient):
        """Test accessing sharelink for gallery with no photos."""
        # Create user, gallery, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        # Create gallery (no photos)
        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Access sharelink
        response = client.get(f"/s/{share_id}")
        assert response.status_code == 200
        data = response.json()
        assert "photos" in data
        assert len(data["photos"]) == 0

    def test_get_photos_by_sharelink_expired(self, client: TestClient):
        """Test accessing expired sharelink."""
        # Create user, gallery, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        # Create gallery
        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Create expired sharelink
        expires_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()  # Expired
        payload = {"expires_at": expires_at, "gallery_id": gallery_id}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to access expired sharelink
        response = client.get(f"/s/{share_id}")
        assert response.status_code == 404
        assert "expired" in response.json()["detail"].lower()

    def test_get_single_photo_by_sharelink_success(self, client: TestClient):
        """Test successfully accessing a single photo via sharelink."""
        # Setup: create user, gallery, photo, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Access single photo
        response = client.get(f"/s/{share_id}/photos/{photo_id}")
        assert response.status_code == 200

    def test_get_single_photo_by_sharelink_not_found(self, client: TestClient):
        """Test accessing non-existent photo via sharelink."""
        # Setup: create user, gallery, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to access non-existent photo
        fake_photo_id = str(uuid4())
        response = client.get(f"/s/{share_id}/photos/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_single_photo_by_sharelink_expired(self, client: TestClient):
        """Test accessing photo via expired sharelink."""
        # Setup: create user, gallery, photo, and expired sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Create expired sharelink
        expires_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": gallery_id}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to access photo via expired sharelink
        response = client.get(f"/s/{share_id}/photos/{photo_id}")
        assert response.status_code == 404
        assert "expired" in response.json()["detail"].lower()

    def test_download_all_photos_zip_success(self, client: TestClient):
        """Test downloading all photos as ZIP via sharelink."""
        # Setup: create user, gallery, photos, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload multiple photos
        for i in range(3):
            image_content = f"fake image content {i}".encode()
            files = {"file": (f"test{i}.jpg", io.BytesIO(image_content), "image/jpeg")}
            upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
            assert upload_response.status_code == 201

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Download ZIP
        response = client.get(f"/s/{share_id}/download/all")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert "attachment" in response.headers["content-disposition"]
        assert "gallery.zip" in response.headers["content-disposition"]

    def test_download_all_photos_zip_empty_gallery(self, client: TestClient):
        """Test downloading ZIP from gallery with no photos."""
        # Setup: create user, gallery (no photos), and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to download ZIP
        response = client.get(f"/s/{share_id}/download/all")
        assert response.status_code == 404
        assert "no photos found" in response.json()["detail"].lower()

    def test_download_all_photos_zip_expired_sharelink(self, client: TestClient):
        """Test downloading ZIP via expired sharelink."""
        # Setup: create user, gallery, photo, and expired sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        assert upload_response.status_code == 201

        # Create expired sharelink
        expires_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to download ZIP
        response = client.get(f"/s/{share_id}/download/all")
        assert response.status_code == 404
        assert "expired" in response.json()["detail"].lower()

    def test_download_single_photo_success(self, client: TestClient):
        """Test downloading single photo via sharelink."""
        # Setup: create user, gallery, photo, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Download single photo
        response = client.get(f"/s/{share_id}/download/{photo_id}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/octet-stream"
        assert "attachment" in response.headers["content-disposition"]

    def test_download_single_photo_not_found(self, client: TestClient):
        """Test downloading non-existent photo via sharelink."""
        # Setup: create user, gallery, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to download non-existent photo
        fake_photo_id = str(uuid4())
        response = client.get(f"/s/{share_id}/download/{fake_photo_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_download_single_photo_expired_sharelink(self, client: TestClient):
        """Test downloading photo via expired sharelink."""
        # Setup: create user, gallery, photo, and expired sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        upload_response = client.post(f"/galleries/{gallery_id}/photos", files=files)
        photo_id = upload_response.json()["id"]

        # Create expired sharelink
        expires_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Try to download photo
        response = client.get(f"/s/{share_id}/download/{photo_id}")
        assert response.status_code == 404
        assert "expired" in response.json()["detail"].lower()

    def test_sharelink_view_counter_increment(self, client: TestClient):
        """Test that sharelink view counter increments properly."""
        # Setup: create user, gallery, photo, and sharelink
        user_token = register_and_login(client, "user@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user_token}"})

        gallery_response = client.post("/galleries/", json={})
        gallery_id = gallery_response.json()["id"]

        # Upload photo
        image_content = b"fake image content"
        files = {"file": ("test.jpg", io.BytesIO(image_content), "image/jpeg")}
        client.post(f"/galleries/{gallery_id}/photos", files=files)

        # Create sharelink
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}
        sharelink_response = client.post(f"/galleries/{gallery_id}/share-links", json=payload)
        share_id = sharelink_response.json()["id"]

        # Clear auth headers
        client.headers.clear()

        # Access sharelink multiple times
        for _ in range(3):
            response = client.get(f"/s/{share_id}")
            assert response.status_code == 200

        # TODO: Add test to verify view counter increased
        # This would require adding an endpoint to get sharelink details
        # or modifying the gallery detail endpoint to show sharelink stats
