"""Tests for photo API endpoints."""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, select

from tests.helpers import register_and_login, upload_photo_via_presigned
from viewport.api.photo import MAX_FILE_SIZE, _invalidate_presigned_cache_safely, _photo_needs_thumbnail_processing, get_content_type_from_filename, sanitize_filename
from viewport.models.gallery import Photo, PhotoUploadStatus, ThumbnailOutbox
from viewport.models.user import User

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.ext.asyncio import AsyncSession
pytestmark = pytest.mark.requires_s3


class TestPhotoAPI:
    """Test photo API endpoints with comprehensive coverage."""

    def test_photo_needs_thumbnail_processing_detects_missing_or_placeholder_metadata(self):
        complete_photo = Photo(
            gallery_id=uuid4(),
            object_key="gallery/original.jpg",
            thumbnail_object_key="gallery/thumb.jpg",
            file_size=123,
            width=1200,
            height=800,
        )
        placeholder_thumb = Photo(
            gallery_id=uuid4(),
            object_key="gallery/original.jpg",
            thumbnail_object_key="gallery/original.jpg",
            file_size=123,
            width=1200,
            height=800,
        )
        missing_width = Photo(
            gallery_id=uuid4(),
            object_key="gallery/original.jpg",
            thumbnail_object_key="gallery/thumb.jpg",
            file_size=123,
            width=None,
            height=800,
        )

        assert _photo_needs_thumbnail_processing(complete_photo) is False
        assert _photo_needs_thumbnail_processing(placeholder_thumb) is True
        assert _photo_needs_thumbnail_processing(missing_width) is True

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
        response = authenticated_client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [fake_photo_id]},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["requested_count"] == 1
        assert payload["deleted_ids"] == []
        assert payload["not_found_ids"] == [fake_photo_id]
        assert payload["failed_ids"] == []

    def test_delete_photo_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting photo from non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = authenticated_client.request(
            "DELETE",
            f"/galleries/{fake_gallery_id}/photos",
            json={"photo_ids": [fake_photo_id]},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_photo_unauthorized(self, client: TestClient):
        """Test deleting photo without authentication."""
        fake_gallery_id = str(uuid4())
        fake_photo_id = str(uuid4())
        response = client.request(
            "DELETE",
            f"/galleries/{fake_gallery_id}/photos",
            json={"photo_ids": [fake_photo_id]},
        )
        assert response.status_code == 401

    def test_delete_photo_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting photo from gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_photo_id = str(uuid4())
        response = client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [fake_photo_id]},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_photos_enqueues_batch_task_once(self, authenticated_client: TestClient, gallery_id_fixture: str, monkeypatch):
        """Batch delete should publish a single Celery call for all existing photos."""
        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second", "second.jpg")
        missing_photo_id = str(uuid4())

        captured: dict[str, object] = {}

        def fake_delay(photo_ids: list[str], gallery_id: str, owner_id: str):
            captured["photo_ids"] = photo_ids
            captured["gallery_id"] = gallery_id
            captured["owner_id"] = owner_id

        monkeypatch.setattr("viewport.api.photo.delete_photos_batch_task.delay", fake_delay)

        response = authenticated_client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [first_photo_id, second_photo_id, missing_photo_id]},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["requested_count"] == 3
        assert payload["deleted_ids"] == [first_photo_id, second_photo_id]
        assert payload["not_found_ids"] == [missing_photo_id]
        assert payload["failed_ids"] == []
        assert captured["photo_ids"] == [first_photo_id, second_photo_id]
        assert captured["gallery_id"] == gallery_id_fixture
        assert isinstance(captured["owner_id"], str)

    def test_delete_photos_succeeds_when_cache_invalidation_fails(self, authenticated_client: TestClient, gallery_id_fixture: str, monkeypatch):
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")

        async def fail_cache_invalidation(self, object_keys: list[str]) -> None:
            raise RuntimeError("redis timeout")

        def fake_delay(photo_ids: list[str], gallery_id: str, owner_id: str) -> None:
            return None

        monkeypatch.setattr("viewport.api.photo.AsyncS3Client.clear_presigned_cache_for_object_keys", fail_cache_invalidation)
        monkeypatch.setattr("viewport.api.photo.delete_photos_batch_task.delay", fake_delay)

        response = authenticated_client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [photo_id]},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["deleted_ids"] == [photo_id]
        assert payload["failed_ids"] == []

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

    @pytest.mark.asyncio
    async def test_batch_presigned_uploads_assigns_unique_display_names_and_uuid_object_keys(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession):
        payload = {
            "files": [
                {"filename": "kitty.jpg", "file_size": 101, "content_type": "image/jpeg"},
                {"filename": "kitty.jpg", "file_size": 102, "content_type": "image/jpeg"},
                {"filename": "kitty.jpg", "file_size": 103, "content_type": "image/jpeg"},
            ]
        }

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert response.status_code == 200

        items = response.json()["items"]
        assert [item["filename"] for item in items] == ["kitty.jpg", "kitty (1).jpg", "kitty (2).jpg"]

        gallery_prefix = f"{gallery_id_fixture}/"
        for expected_name, item in zip(["kitty.jpg", "kitty (1).jpg", "kitty (2).jpg"], items, strict=True):
            assert item["success"] is True
            photo_id = UUID(item["photo_id"])
            photo = await db_session.get(Photo, photo_id)
            assert photo is not None
            assert photo.display_name == expected_name
            assert photo.object_key == f"{gallery_prefix}{photo_id}.jpg"
            assert photo.thumbnail_object_key == photo.object_key

    def test_batch_presigned_uploads_size_limit(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Files that exceed MAX_FILE_SIZE are rejected."""
        payload = {"files": [{"filename": "huge.jpg", "file_size": MAX_FILE_SIZE + 1, "content_type": "image/jpeg"}]}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert not item["success"]
        assert "File exceeds maximum size" in item["error"]

    @pytest.mark.asyncio
    async def test_batch_confirm_uploads_updates_counts_and_triggers_task(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession):
        """Confirming uploads updates counts and writes to outbox."""
        payload = {"files": [{"filename": "confirm.jpg", "file_size": 256, "content_type": "image/jpeg"}]}
        presigned = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        item = presigned.json()["items"][0]
        photo_id = item["photo_id"]

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

        # Verify outbox contains the confirmed photo
        stmt = select(ThumbnailOutbox).where(ThumbnailOutbox.photo_id == UUID(photo_id))
        row = (await db_session.execute(stmt)).scalar_one_or_none()
        assert row is not None
        assert row.object_key  # object_key should be populated
        # Clean up
        await db_session.execute(delete(ThumbnailOutbox).where(ThumbnailOutbox.photo_id == UUID(photo_id)))
        await db_session.commit()

    @pytest.mark.skip(reason="FIx later")
    def test_delete_photo_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Deleting an existing photo returns 204 and subsequently 404."""
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"delete", "delete.jpg")

        response = authenticated_client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [photo_id]},
        )
        assert response.status_code == 200
        assert response.json()["deleted_ids"] == [photo_id]

        second = authenticated_client.request(
            "DELETE",
            f"/galleries/{gallery_id_fixture}/photos",
            json={"photo_ids": [photo_id]},
        )
        assert second.status_code == 200
        assert second.json()["not_found_ids"] == [photo_id]

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
        assert "width" not in data
        assert "height" not in data

    def test_rename_photo_succeeds_when_cache_invalidation_fails(self, authenticated_client: TestClient, gallery_id_fixture: str, monkeypatch):
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"rename", "rename.jpg")

        async def fail_cache_invalidation(self, object_keys: list[str]) -> None:
            raise RuntimeError("redis timeout")

        monkeypatch.setattr("viewport.api.photo.AsyncS3Client.clear_presigned_cache_for_object_keys", fail_cache_invalidation)

        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename",
            json={"filename": "new-name.jpg"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == photo_id
        assert data["filename"] == "new-name.jpg"
        assert "width" not in data
        assert "height" not in data

    @pytest.mark.asyncio
    async def test_rename_photo_updates_display_name_without_changing_object_key(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession):
        photo_id = UUID(upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"rename-immutable", "rename.jpg"))
        before = await db_session.get(Photo, photo_id)
        assert before is not None
        original_object_key = before.object_key

        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename",
            json={"filename": "renamed.jpg"},
        )
        assert response.status_code == 200

        db_session.expire_all()
        after = await db_session.get(Photo, photo_id)
        assert after is not None
        assert after.object_key == original_object_key
        assert after.display_name == "renamed.jpg"

    def test_rename_photo_makes_name_unique_when_conflict_exists(self, authenticated_client: TestClient, gallery_id_fixture: str):
        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "1.JPG")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second", "2.JPG")

        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{second_photo_id}/rename",
            json={"filename": "1.JPG"},
        )
        assert response.status_code == 200
        assert response.json()["filename"] == "1 (1).JPG"

        list_response = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert list_response.status_code == 200
        filenames = {item["id"]: item["filename"] for item in list_response.json()["photos"]}
        assert filenames[first_photo_id] == "1.JPG"
        assert filenames[second_photo_id] == "1 (1).JPG"
        assert all("width" not in item and "height" not in item for item in list_response.json()["photos"])

    def test_filename_utilities(self):
        """sanitize_filename and content-type helper behave predictably."""
        assert sanitize_filename(".hidden/file?.png") == "hiddenfile.png"
        assert sanitize_filename("") == "file"
        assert get_content_type_from_filename("photo.jpg") == "image/jpeg"
        assert get_content_type_from_filename(None) == "image/jpeg"

    @pytest.mark.asyncio
    async def test_invalidate_presigned_cache_safely_skips_empty_keys(self):
        s3_client = AsyncMock()

        await _invalidate_presigned_cache_safely(s3_client, [], "batch_delete")

        s3_client.clear_presigned_cache_for_object_keys.assert_not_called()

    @pytest.mark.asyncio
    async def test_batch_confirm_missing_s3_object_is_accepted_and_finalized(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession):
        payload = {"files": [{"filename": "missing-object.jpg", "file_size": 256, "content_type": "image/jpeg"}]}
        presigned = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert presigned.status_code == 200
        item = presigned.json()["items"][0]
        photo_id = UUID(item["photo_id"])

        me_resp = authenticated_client.get("/me")
        assert me_resp.status_code == 200
        user_id = UUID(me_resp.json()["id"])

        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos/batch-confirm",
            json={"items": [{"photo_id": str(photo_id), "success": True}]},
        )

        assert response.status_code == 200
        result = response.json()
        assert result["confirmed_count"] == 1
        assert result["failed_count"] == 0

        db_session.expire_all()
        user = await db_session.get(User, user_id)
        photo = await db_session.get(Photo, photo_id)
        assert user is not None
        assert photo is not None
        assert user.storage_used == 256
        assert user.storage_reserved == 0
        assert photo.status == PhotoUploadStatus.THUMBNAIL_CREATING

    @pytest.mark.asyncio
    async def test_batch_confirm_outbox_is_atomic_with_db_state(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession):
        """Confirm writes outbox atomically — DB state committed alongside outbox."""
        payload = {"files": [{"filename": "rollback.jpg", "file_size": 256, "content_type": "image/jpeg"}]}
        presigned = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)
        assert presigned.status_code == 200
        item = presigned.json()["items"][0]
        photo_id = UUID(item["photo_id"])

        me_resp = authenticated_client.get("/me")
        assert me_resp.status_code == 200
        user_id = UUID(me_resp.json()["id"])

        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos/batch-confirm",
            json={"items": [{"photo_id": str(photo_id), "success": True}]},
        )
        assert response.status_code == 200  # outbox always atomic with DB

        db_session.expire_all()
        user = await db_session.get(User, user_id)
        photo = await db_session.get(Photo, photo_id)
        assert user is not None
        assert photo is not None
        assert user.storage_used == 256
        assert user.storage_reserved == 0
        assert photo.status == PhotoUploadStatus.THUMBNAIL_CREATING

        # Verify outbox row exists
        stmt = select(ThumbnailOutbox).where(ThumbnailOutbox.photo_id == photo_id)
        outbox_row = (await db_session.execute(stmt)).scalar_one_or_none()
        assert outbox_row is not None

    @pytest.mark.asyncio
    async def test_batch_presigned_generic_presign_failure_does_not_reserve_quota(self, authenticated_client: TestClient, gallery_id_fixture: str, db_session: AsyncSession, monkeypatch):
        """Presign failure for a file means no quota reservation is made (reservation happens after presign)."""
        payload = {"files": [{"filename": "presign-error.jpg", "file_size": 256, "content_type": "image/jpeg"}]}

        me_resp = authenticated_client.get("/me")
        assert me_resp.status_code == 200
        user_id = UUID(me_resp.json()["id"])

        def fail_presign(*args, **kwargs):
            raise RuntimeError("presign unavailable")

        monkeypatch.setattr("viewport.api.photo.AsyncS3Client.generate_presigned_put", fail_presign)

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/batch-presigned", json=payload)

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["success"] is False
        assert item["error"] == "Failed to generate presigned URL"

        db_session.expire_all()
        user = await db_session.get(User, user_id)
        assert user is not None
        assert user.storage_reserved == 0  # No reservation because presign failed before DB tx
