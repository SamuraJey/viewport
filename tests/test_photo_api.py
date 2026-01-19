"""Tests for photo API endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login, upload_photo_via_presigned
from viewport.api.photo import MAX_FILE_SIZE, get_content_type_from_filename, sanitize_filename
from viewport.dependencies import get_s3_client
from viewport.models.gallery import PhotoUploadStatus


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

    def test_get_all_photo_urls_for_gallery_with_photos(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Getting photo URLs returns uploaded photos."""
        payload = b"test bytes"
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, payload, "capture.jpg")

        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/urls")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        photo = data[0]
        assert photo["id"] == photo_id
        assert photo["file_size"] == len(payload)
        assert photo["url"].startswith("http")
        assert photo["thumbnail_url"].startswith("http")

    def test_batch_presigned_uploads_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Batch presigned uploads returns valid PUT instructions."""
        payload = {"files": [{"filename": "picture.png", "file_size": 1024, "content_type": "image/png"}]}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 1
        item = items[0]
        assert item["success"]
        assert item["presigned_data"]["headers"]["Content-Length"] == "1024"
        assert item["presigned_data"]["headers"]["Content-Type"] == "image/png"
        assert item["presigned_data"]["url"].startswith("http")

    def test_batch_presigned_uploads_size_limit(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Files that exceed MAX_FILE_SIZE are rejected."""
        payload = {"files": [{"filename": "huge.jpg", "file_size": MAX_FILE_SIZE + 1, "content_type": "image/jpeg"}]}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert not item["success"]
        assert "File exceeds maximum size" in item["error"]

    def test_batch_confirm_uploads_updates_counts_and_triggers_task(self, authenticated_client: TestClient, gallery_id_fixture: str, monkeypatch):
        """Confirming uploads updates counts and schedules thumbnail task."""
        payload = {"files": [{"filename": "confirm.jpg", "file_size": 256, "content_type": "image/jpeg"}]}
        presigned = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        item = presigned.json()["items"][0]
        photo_id = item["photo_id"]

        # NEW: Actually upload the file to S3 so head_object succeeds
        import requests

        upload_resp = requests.put(item["presigned_data"]["url"], headers=item["presigned_data"]["headers"], data=b"x" * 256)
        assert upload_resp.status_code in {200, 204}

        captured: dict[str, list] = {}

        def fake_delay(batch: list[dict]):
            captured["batch"] = batch

        monkeypatch.setattr("viewport.background_tasks.create_thumbnails_batch_task.delay", fake_delay)

        confirm_payload = {
            "items": [
                {"photo_id": photo_id, "success": True},
                {"photo_id": str(uuid4()), "success": False},
            ]
        }
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-confirm", json=confirm_payload)

        assert response.status_code == 200
        result = response.json()
        assert result["confirmed_count"] == 1
        assert result["failed_count"] == 1
        assert captured["batch"][0]["photo_id"] == photo_id

    def test_debug_photo_tags_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Debug endpoint returns tags for successfully uploaded photos."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"tag-content", "tag.jpg")

        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/debug-tags")
        assert response.status_code == 200
        data = response.json()
        assert data["photo_id"] == photo_id
        assert data["status"] == PhotoUploadStatus.SUCCESSFUL
        # Note: Tagging is now asynchronous in Celery, so it stays 'pending' right after confirmation
        assert data["s3_tags"]["upload-status"] == "pending"

    def test_debug_photo_tags_handles_errors(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Debug endpoint returns error payload when S3 tagging fails."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"error", "error.jpg")

        async def broken_client():
            class Broken:
                async def get_object_tagging(self, key: str):  # noqa: ARG002
                    raise RuntimeError("boom")

            yield Broken()

        app = authenticated_client.app
        previous = app.dependency_overrides.get(get_s3_client)
        app.dependency_overrides[get_s3_client] = broken_client
        try:
            response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{photo_id}/debug-tags")
        finally:
            if previous is None:
                app.dependency_overrides.pop(get_s3_client, None)
            else:
                app.dependency_overrides[get_s3_client] = previous

        assert response.status_code == 200
        assert "error" in response.json()

    def test_delete_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Deleting an existing photo returns 204 and subsequently 404."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"delete", "delete.jpg")

        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/photos/{photo_id}")
        assert response.status_code == 204

        second = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/photos/{photo_id}")
        assert second.status_code == 404

    def test_rename_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Renaming a photo updates the filename."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"rename", "rename.jpg")
        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename",
            json={"filename": "new-name.jpg"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == photo_id
        assert data["filename"] == "new-name.jpg"

    def test_filename_utilities(self):
        """sanitize_filename and content-type helper behave predictably."""
        assert sanitize_filename(".hidden/file?.png") == "hiddenfile.png"
        assert sanitize_filename("") == "file"
        assert get_content_type_from_filename("photo.webp") == "image/webp"
        assert get_content_type_from_filename(None) == "image/jpeg"
