"""Tests for gallery API endpoints."""

import io
import zipfile
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.helpers import register_and_login, upload_photo_via_presigned
from viewport.api.gallery import _get_project_name
from viewport.gallery_constants import GALLERY_NAME_MAX_LENGTH, PHOTO_SEARCH_MAX_LENGTH

pytestmark = pytest.mark.requires_s3


class TestGalleryAPI:
    """Test gallery API endpoints with comprehensive coverage."""

    def test_create_gallery_success(self, authenticated_client: TestClient):
        """Test successful gallery creation."""
        response = authenticated_client.post("/galleries", json={})
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "owner_id" in data
        assert "created_at" in data
        assert "shooting_date" in data
        assert data["public_sort_by"] == "original_filename"
        assert data["public_sort_order"] == "asc"
        assert data["photo_count"] == 0
        assert data["total_size_bytes"] == 0
        assert data["has_active_share_links"] is False
        assert data["cover_photo_thumbnail_url"] is None
        assert "recent_photo_thumbnail_urls" not in data
        # Verify the ID is a valid UUID format
        import uuid

        uuid.UUID(data["id"])  # Should not raise exception

    def test_create_gallery_unauthorized(self, client: TestClient):
        """Test gallery creation without authentication."""
        response = client.post("/galleries", json={})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_project_name_returns_none_for_gallery_without_project(self):
        repo = MagicMock()
        gallery = SimpleNamespace(project_id=None, owner_id=uuid4())

        project_name = await _get_project_name(gallery, repo)

        assert project_name is None
        repo.get_project_by_id_and_owner.assert_not_called()

    def test_create_gallery_invalid_token(self, client: TestClient):
        """Test gallery creation with invalid token."""
        client.headers.update({"Authorization": "Bearer invalid_token"})
        response = client.post("/galleries", json={})
        assert response.status_code == 401

    def test_create_gallery_rejects_invalid_project_id(self, authenticated_client: TestClient):
        response = authenticated_client.post(
            "/galleries",
            json={"name": "Bad Gallery", "project_id": "not-a-uuid"},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid project_id"

    def test_create_gallery_rejects_unknown_project(self, authenticated_client: TestClient):
        response = authenticated_client.post(
            "/galleries",
            json={"name": "Missing Project", "project_id": str(uuid4())},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

    def test_create_gallery_with_existing_project_id(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Existing Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        response = authenticated_client.post(
            "/galleries",
            json={"name": "Added Gallery", "project_id": project_id},
        )

        assert response.status_code == 201
        payload = response.json()
        assert payload["project_id"] == project_id
        assert payload["name"] == "Added Gallery"

    def test_list_galleries_empty(self, authenticated_client: TestClient):
        """Test listing galleries when user has no galleries."""
        response = authenticated_client.get("/galleries")
        assert response.status_code == 200
        data = response.json()
        assert data["galleries"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["size"] == 10

    def test_list_galleries_with_galleries(self, authenticated_client: TestClient):
        """Test listing galleries when user has galleries."""
        # Create several galleries
        gallery_ids = []
        for _ in range(3):
            response = authenticated_client.post("/galleries", json={})
            assert response.status_code == 201
            gallery_ids.append(response.json()["id"])

        # List galleries
        response = authenticated_client.get("/galleries")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 3
        assert data["total"] == 3
        assert data["page"] == 1
        assert data["size"] == 10

        # Verify all created galleries are in the response
        returned_ids = [g["id"] for g in data["galleries"]]
        for gallery_id in gallery_ids:
            assert gallery_id in returned_ids

    def test_list_galleries_pagination(self, authenticated_client: TestClient):
        """Test gallery listing with pagination."""
        # Create 5 galleries
        for _ in range(5):
            response = authenticated_client.post("/galleries", json={})
            assert response.status_code == 201

        # Test first page with size 2
        response = authenticated_client.get("/galleries?page=1&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["size"] == 2

        # Test second page
        response = authenticated_client.get("/galleries?page=2&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 2
        assert data["page"] == 2
        assert data["size"] == 2

        # Test third page (should have 1 gallery)
        response = authenticated_client.get("/galleries?page=3&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 1
        assert data["page"] == 3

    def test_list_galleries_invalid_pagination(self, authenticated_client: TestClient):
        """Test gallery listing with invalid pagination parameters."""
        # Invalid page (less than 1)
        response = authenticated_client.get("/galleries?page=0")
        assert response.status_code == 422

        # Invalid size (greater than 100)
        response = authenticated_client.get("/galleries?size=101")
        assert response.status_code == 422

        # Invalid size (less than 1)
        response = authenticated_client.get("/galleries?size=0")
        assert response.status_code == 422

    def test_list_galleries_rejects_invalid_project_filter(self, authenticated_client: TestClient):
        response = authenticated_client.get("/galleries?project_id=not-a-uuid")

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid project_id"

    def test_list_galleries_supports_search(self, authenticated_client: TestClient):
        authenticated_client.post("/galleries", json={"name": "Summer Wedding"})
        authenticated_client.post("/galleries", json={"name": "Corporate Shoot"})

        response = authenticated_client.get("/galleries?search=summer")
        assert response.status_code == 200

        payload = response.json()
        assert payload["total"] == 1
        assert len(payload["galleries"]) == 1
        assert payload["galleries"][0]["name"] == "Summer Wedding"

    def test_list_galleries_supports_sort_by_photo_count(self, authenticated_client: TestClient):
        high_count_response = authenticated_client.post("/galleries", json={"name": "High Count"})
        low_count_response = authenticated_client.post("/galleries", json={"name": "Low Count"})

        high_count_gallery_id = high_count_response.json()["id"]
        low_count_gallery_id = low_count_response.json()["id"]

        upload_photo_via_presigned(authenticated_client, high_count_gallery_id, b"image-1", "high-1.jpg")
        upload_photo_via_presigned(authenticated_client, high_count_gallery_id, b"image-2", "high-2.jpg")
        upload_photo_via_presigned(authenticated_client, low_count_gallery_id, b"image-3", "low-1.jpg")

        response = authenticated_client.get("/galleries?sort_by=photo_count&order=desc")
        assert response.status_code == 200

        galleries = response.json()["galleries"]
        high_count_index = next(index for index, gallery in enumerate(galleries) if gallery["id"] == high_count_gallery_id)
        low_count_index = next(index for index, gallery in enumerate(galleries) if gallery["id"] == low_count_gallery_id)
        assert high_count_index < low_count_index

    def test_list_galleries_unauthorized(self, client: TestClient):
        """Test listing galleries without authentication."""
        response = client.get("/galleries")
        assert response.status_code == 401

    def test_get_gallery_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful gallery retrieval."""
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == gallery_id_fixture
        assert "owner_id" in data
        assert "created_at" in data
        assert "shooting_date" in data
        assert "public_sort_by" in data
        assert "public_sort_order" in data
        assert "photos" in data
        assert "share_links" not in data
        assert "total_photos" in data
        assert "total_size_bytes" in data
        assert isinstance(data["photos"], list)
        assert all("width" in photo and "height" in photo for photo in data["photos"])

    def test_get_gallery_supports_photo_search_and_sort(self, authenticated_client: TestClient, gallery_id_fixture: str):
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"zeta-payload", "zeta.jpg")
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"alpha-payload", "alpha.jpg")
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"beta-payload", "beta.jpg")

        sorted_response = authenticated_client.get(
            f"/galleries/{gallery_id_fixture}",
            params={
                "limit": 10,
                "offset": 0,
                "sort_by": "original_filename",
                "order": "asc",
            },
        )
        assert sorted_response.status_code == 200
        sorted_payload = sorted_response.json()
        assert [photo["filename"] for photo in sorted_payload["photos"]] == ["alpha.jpg", "beta.jpg", "zeta.jpg"]
        assert all(isinstance(photo.get("width"), int) and isinstance(photo.get("height"), int) for photo in sorted_payload["photos"])

        filtered_response = authenticated_client.get(
            f"/galleries/{gallery_id_fixture}",
            params={
                "limit": 10,
                "offset": 0,
                "search": "ta",
                "sort_by": "original_filename",
                "order": "asc",
            },
        )
        assert filtered_response.status_code == 200
        filtered_payload = filtered_response.json()
        assert filtered_payload["total_photos"] == 2
        assert [photo["filename"] for photo in filtered_payload["photos"]] == ["beta.jpg", "zeta.jpg"]
        assert all(isinstance(photo.get("width"), int) and isinstance(photo.get("height"), int) for photo in filtered_payload["photos"])

    def test_get_gallery_defaults_to_legacy_filename_order_when_sort_omitted(self, authenticated_client: TestClient, gallery_id_fixture: str):
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"legacy-zeta", "legacy-default-zeta.jpg")
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"legacy-alpha", "legacy-default-alpha.jpg")
        upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"legacy-beta", "legacy-default-beta.jpg")

        response = authenticated_client.get(
            f"/galleries/{gallery_id_fixture}",
            params={
                "search": "legacy-default-",
                "limit": 10,
                "offset": 0,
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["total_photos"] == 3
        assert [photo["filename"] for photo in payload["photos"]] == [
            "legacy-default-alpha.jpg",
            "legacy-default-beta.jpg",
            "legacy-default-zeta.jpg",
        ]

    def test_get_gallery_rejects_too_long_search_query(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.get(
            f"/galleries/{gallery_id_fixture}",
            params={"search": "a" * (PHOTO_SEARCH_MAX_LENGTH + 1)},
        )

        assert response.status_code == 422

    def test_get_gallery_not_found(self, authenticated_client: TestClient):
        """Test retrieving non-existent gallery."""
        fake_uuid = str(uuid4())
        response = authenticated_client.get(f"/galleries/{fake_uuid}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_gallery_invalid_uuid(self, authenticated_client: TestClient):
        """Test retrieving gallery with invalid UUID format."""
        response = authenticated_client.get("/galleries/invalid-uuid")
        assert response.status_code == 422
        assert "Input should be a valid UUID" in str(response.json())

    def test_get_gallery_unauthorized(self, client: TestClient):
        """Test retrieving gallery without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.get(f"/galleries/{fake_gallery_id}")
        assert response.status_code == 401

    def test_get_gallery_different_user(self, client: TestClient, gallery_id_fixture: str):
        """Test retrieving gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        response = client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_gallery_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful gallery deletion."""
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 204

        # Verify gallery is deleted
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404

    def test_delete_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting non-existent gallery."""
        fake_uuid = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{fake_uuid}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_gallery_invalid_uuid(self, authenticated_client: TestClient):
        """Test deleting gallery with invalid UUID format."""
        response = authenticated_client.delete("/galleries/invalid-uuid")
        assert response.status_code == 422
        assert "Input should be a valid UUID" in str(response.json())

    def test_delete_gallery_unauthorized(self, client: TestClient):
        """Test deleting gallery without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.delete(f"/galleries/{fake_gallery_id}")
        assert response.status_code == 401

    def test_delete_gallery_different_user(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        response = client.delete(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_gallery_isolation_between_users(self, client: TestClient):
        """Test that users can only see their own galleries."""
        # Create first user and gallery
        user1_token = register_and_login(client, "user1@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {user1_token}"})

        resp1 = client.post("/galleries", json={})
        assert resp1.status_code == 201
        gallery1_id = resp1.json()["id"]

        # Create second user and gallery
        user2_token = register_and_login(client, "user2@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {user2_token}"})

        resp2 = client.post("/galleries", json={})
        assert resp2.status_code == 201
        gallery2_id = resp2.json()["id"]

        # User 2 should only see their gallery
        resp = client.get("/galleries")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["galleries"]) == 1
        assert data["galleries"][0]["id"] == gallery2_id

        # User 2 should not be able to access user 1's gallery
        resp = client.get(f"/galleries/{gallery1_id}")
        assert resp.status_code == 404

        # Switch back to user 1
        client.headers.update({"Authorization": f"Bearer {user1_token}"})

        # User 1 should only see their gallery
        resp = client.get("/galleries")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["galleries"]) == 1
        assert data["galleries"][0]["id"] == gallery1_id

        # User 1 should not be able to access user 2's gallery
        resp = client.get(f"/galleries/{gallery2_id}")
        assert resp.status_code == 404

    def test_create_gallery_with_name(self, authenticated_client: TestClient):
        """Test creating a gallery with a custom name."""
        name = "Holiday Pics"
        response = authenticated_client.post("/galleries", json={"name": name})
        assert response.status_code == 201
        data = response.json()
        assert "name" in data
        assert data["name"] == name

    def test_create_gallery_name_too_long(self, authenticated_client: TestClient):
        """Custom names longer than the limit are rejected."""
        name = "A" * (GALLERY_NAME_MAX_LENGTH + 1)
        response = authenticated_client.post("/galleries", json={"name": name})
        assert response.status_code == 422
        detail = response.json().get("detail")
        assert detail is not None
        assert str(GALLERY_NAME_MAX_LENGTH) in str(detail)

    def test_create_gallery_with_shooting_date(self, authenticated_client: TestClient):
        shooting_date = date(2023, 7, 15)
        response = authenticated_client.post("/galleries", json={"shooting_date": shooting_date.isoformat()})
        assert response.status_code == 201
        payload = response.json()
        assert payload["shooting_date"] == shooting_date.isoformat()

    def test_list_galleries_with_name(self, authenticated_client: TestClient):
        """Test listing galleries returns the correct names."""
        # Create galleries with names
        entries = [(authenticated_client.post("/galleries", json={"name": n}).json()["id"], n) for n in ["One", "Two"]]
        response = authenticated_client.get("/galleries")
        assert response.status_code == 200
        data = response.json()
        name_map = {g["id"]: g["name"] for g in data["galleries"]}
        for gid, expected_name in entries:
            assert gid in name_map
            assert name_map[gid] == expected_name

    def test_get_gallery_name(self, authenticated_client: TestClient):
        """Test getting gallery detail returns the name."""
        name = "Event Album"
        resp = authenticated_client.post("/galleries", json={"name": name})
        gid = resp.json()["id"]
        response = authenticated_client.get(f"/galleries/{gid}")
        assert response.status_code == 200
        detail = response.json()
        assert "name" in detail
        assert detail["name"] == name

    def test_update_gallery_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful gallery rename."""
        new_name = "Renamed Gallery"
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}", json={"name": new_name})
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == gallery_id_fixture
        assert data["name"] == new_name

    def test_update_gallery_name_too_long(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Updates with names beyond the limit are rejected."""
        long_name = "B" * (GALLERY_NAME_MAX_LENGTH + 1)
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}", json={"name": long_name})
        assert response.status_code == 422
        detail = response.json().get("detail")
        assert detail is not None
        assert str(GALLERY_NAME_MAX_LENGTH) in str(detail)

    def test_update_gallery_shooting_date(self, authenticated_client: TestClient, gallery_id_fixture: str):
        new_date = date(2024, 5, 12)
        response = authenticated_client.patch(f"/galleries/{gallery_id_fixture}", json={"shooting_date": new_date.isoformat()})
        assert response.status_code == 200
        detail = response.json()
        assert detail["shooting_date"] == new_date.isoformat()

        # Fetch detail to ensure persistence
        fetched = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert fetched.status_code == 200
        assert fetched.json()["shooting_date"] == new_date.isoformat()

    def test_update_gallery_public_sort_settings(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}",
            json={"public_sort_by": "file_size", "public_sort_order": "desc"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["public_sort_by"] == "file_size"
        assert payload["public_sort_order"] == "desc"

        fetched = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert fetched.status_code == 200
        assert fetched.json()["public_sort_by"] == "file_size"
        assert fetched.json()["public_sort_order"] == "desc"

    def test_update_gallery_invalid_uuid(self, authenticated_client: TestClient):
        """Test renaming with invalid UUID format."""
        response = authenticated_client.patch("/galleries/invalid-uuid", json={"name": "Name"})
        assert response.status_code == 422
        assert "Input should be a valid UUID" in str(response.json())

    def test_update_gallery_not_found(self, authenticated_client: TestClient):
        """Test renaming non-existent gallery."""
        fake_id = str(uuid4())
        response = authenticated_client.patch(f"/galleries/{fake_id}", json={"name": "Name"})
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_gallery_rejects_invalid_project_id(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}",
            json={"project_id": "not-a-uuid"},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid project_id"

    def test_update_gallery_rejects_unknown_project(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}",
            json={"project_id": str(uuid4())},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

    def test_update_gallery_detach_rejects_missing_gallery(self, authenticated_client: TestClient):
        response = authenticated_client.patch(
            f"/galleries/{uuid4()}",
            json={"project_id": None},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Gallery not found"

    def test_update_gallery_unauthorized(self, client: TestClient):
        """Test renaming without authentication."""
        fake_id = str(uuid4())
        response = client.patch(f"/galleries/{fake_id}", json={"name": "Name"})
        assert response.status_code == 401

    def test_download_whole_gallery_as_zip(self, authenticated_client: TestClient, gallery_id_fixture: str):
        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first-bytes", "first.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second-bytes", "second.jpg")

        fake_bucket = "test-bucket"

        with patch("viewport.api.gallery.get_s3_settings") as mock_get_settings, patch("viewport.api.gallery.get_sync_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.side_effect = lambda Bucket, Key: {"Body": io.BytesIO(f"payload-{Key}".encode())}
            mock_get_s3.return_value = mock_client

            response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/download/all")

        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/zip"

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = archive.namelist()

        assert len(names) == 2
        assert "first.jpg" in names
        assert "second.jpg" in names
        assert first_photo_id != second_photo_id

    def test_download_single_photo_redirects_to_attachment_presigned_url(self, authenticated_client: TestClient, gallery_id_fixture: str):
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"single-bytes", "single.jpg")

        with patch(
            "viewport.api.photo.AsyncS3Client.generate_presigned_url_async",
            new_callable=AsyncMock,
            return_value="https://storage.example/single-download",
        ) as mock_presign:
            response = authenticated_client.post(
                f"/galleries/{gallery_id_fixture}/photos/{photo_id}/download",
                follow_redirects=False,
            )

        assert response.status_code == 303
        assert response.headers["location"] == "https://storage.example/single-download"
        assert mock_presign.await_args.kwargs["response_content_disposition"] == 'attachment; filename="single.jpg"'

    def test_download_single_photo_returns_404_for_unknown_gallery(self, authenticated_client: TestClient):
        response = authenticated_client.post(
            f"/galleries/{uuid4()}/photos/{uuid4()}/download",
            follow_redirects=False,
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Gallery not found"

    def test_download_single_photo_returns_404_for_unknown_photo(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos/{uuid4()}/download",
            follow_redirects=False,
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Photo not found"

    def test_download_single_photo_accepts_form_access_token(self, client: TestClient, auth_token: str):
        client.headers.update({"Authorization": f"Bearer {auth_token}"})
        gallery_response = client.post("/galleries", json={})
        assert gallery_response.status_code == 201
        gallery_id = gallery_response.json()["id"]
        photo_id = upload_photo_via_presigned(client, gallery_id, b"single-bytes", "single.jpg")
        client.headers.pop("Authorization", None)

        with patch(
            "viewport.api.photo.AsyncS3Client.generate_presigned_url_async",
            new_callable=AsyncMock,
            return_value="https://storage.example/single-form-download",
        ) as mock_presign:
            response = client.post(
                f"/galleries/{gallery_id}/photos/{photo_id}/download",
                data={"access_token": auth_token},
                follow_redirects=False,
            )

        assert response.status_code == 303
        assert response.headers["location"] == "https://storage.example/single-form-download"
        assert mock_presign.await_args.kwargs["response_content_disposition"] == 'attachment; filename="single.jpg"'

    def test_download_whole_gallery_as_zip_accepts_form_access_token(self, client: TestClient, auth_token: str):
        client.headers.update({"Authorization": f"Bearer {auth_token}"})
        gallery_response = client.post("/galleries", json={})
        assert gallery_response.status_code == 201
        gallery_id = gallery_response.json()["id"]
        upload_photo_via_presigned(client, gallery_id, b"first-bytes", "first.jpg")
        client.headers.pop("Authorization", None)

        fake_bucket = "test-bucket"

        with patch("viewport.api.gallery.get_s3_settings") as mock_get_settings, patch("viewport.api.gallery.get_sync_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.side_effect = lambda Bucket, Key: {"Body": io.BytesIO(f"payload-{Key}".encode())}
            mock_get_s3.return_value = mock_client

            response = client.post(
                f"/galleries/{gallery_id}/download/all",
                data={"access_token": auth_token},
            )

        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/zip"

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.namelist() == ["first.jpg"]

    def test_download_whole_gallery_as_zip_rejects_query_param_access_token(self, client: TestClient, auth_token: str):
        client.headers.update({"Authorization": f"Bearer {auth_token}"})
        gallery_response = client.post("/galleries", json={})
        assert gallery_response.status_code == 201
        gallery_id = gallery_response.json()["id"]
        upload_photo_via_presigned(client, gallery_id, b"first-bytes", "first.jpg")
        client.headers.pop("Authorization", None)

        response = client.post(f"/galleries/{gallery_id}/download/all?access_token={auth_token}")

        assert response.status_code == 401
        assert response.json()["detail"] == "Not authenticated"

    def test_download_selected_photos_as_zip(self, authenticated_client: TestClient, gallery_id_fixture: str):
        selected_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"selected-bytes", "selected.jpg")
        _other_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"other-bytes", "other.jpg")

        fake_bucket = "test-bucket"

        with patch("viewport.api.gallery.get_s3_settings") as mock_get_settings, patch("viewport.api.gallery.get_sync_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.side_effect = lambda Bucket, Key: {"Body": io.BytesIO(f"payload-{Key}".encode())}
            mock_get_s3.return_value = mock_client

            response = authenticated_client.post(
                f"/galleries/{gallery_id_fixture}/download/selected",
                json={"photo_ids": [selected_photo_id]},
            )

        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/zip"

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = archive.namelist()

        assert names == ["selected.jpg"]

    def test_download_selected_photos_as_zip_accepts_form_body_and_access_token(self, client: TestClient, auth_token: str):
        client.headers.update({"Authorization": f"Bearer {auth_token}"})
        gallery_response = client.post("/galleries", json={})
        assert gallery_response.status_code == 201
        gallery_id = gallery_response.json()["id"]
        selected_photo_id = upload_photo_via_presigned(client, gallery_id, b"selected-bytes", "selected.jpg")
        upload_photo_via_presigned(client, gallery_id, b"other-bytes", "other.jpg")
        client.headers.pop("Authorization", None)

        fake_bucket = "test-bucket"

        with patch("viewport.api.gallery.get_s3_settings") as mock_get_settings, patch("viewport.api.gallery.get_sync_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.side_effect = lambda Bucket, Key: {"Body": io.BytesIO(f"payload-{Key}".encode())}
            mock_get_s3.return_value = mock_client

            response = client.post(
                f"/galleries/{gallery_id}/download/selected",
                data={"access_token": auth_token, "photo_ids": [selected_photo_id]},
            )

        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/zip"

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.namelist() == ["selected.jpg"]

    def test_download_selected_photos_returns_404_for_unknown_photo(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        valid_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"known-bytes", "known.jpg")
        unknown_photo_id = str(uuid4())

        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/download/selected",
            json={"photo_ids": [valid_photo_id, unknown_photo_id]},
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_download_selected_photos_rejects_oversized_id_list(self, authenticated_client: TestClient, gallery_id_fixture: str):
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/download/selected",
            json={"photo_ids": [str(uuid4()) for _ in range(501)]},
        )

        assert response.status_code == 422

    def test_list_galleries_includes_enriched_data(self, authenticated_client: TestClient):
        """Test that gallery list includes photo_count, total_size_bytes, has_active_share_links, and cover_photo_thumbnail_url."""
        # Create a gallery
        create_response = authenticated_client.post("/galleries", json={"name": "Test Gallery"})
        assert create_response.status_code == 201
        created_gallery = create_response.json()
        gallery_id = created_gallery["id"]

        # Verify newly created gallery has zero enriched values
        assert created_gallery["photo_count"] == 0
        assert created_gallery["total_size_bytes"] == 0
        assert created_gallery["has_active_share_links"] is False
        assert created_gallery["cover_photo_thumbnail_url"] is None

        # Upload a photo
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id, b"test-content" * 100, "test.jpg")

        # List galleries and verify enriched data
        list_response = authenticated_client.get("/galleries")
        assert list_response.status_code == 200
        galleries = list_response.json()["galleries"]

        test_gallery = next(g for g in galleries if g["id"] == gallery_id)
        assert test_gallery["photo_count"] == 1
        assert test_gallery["total_size_bytes"] > 0
        assert test_gallery["has_active_share_links"] is False
        assert test_gallery["cover_photo_thumbnail_url"].startswith("http")
        assert "recent_photo_thumbnail_urls" not in test_gallery

        # Set cover photo
        authenticated_client.post(f"/galleries/{gallery_id}/cover/{photo_id}")

        # Create a share link
        share_response = authenticated_client.post(f"/galleries/{gallery_id}/share-links", json={"label": "Test Share"})
        assert share_response.status_code == 201

        # List galleries again and verify enriched data updated
        list_response2 = authenticated_client.get("/galleries")
        assert list_response2.status_code == 200
        galleries2 = list_response2.json()["galleries"]

        test_gallery2 = next(g for g in galleries2 if g["id"] == gallery_id)
        assert test_gallery2["photo_count"] == 1
        assert test_gallery2["total_size_bytes"] > 0
        assert test_gallery2["has_active_share_links"] is True
        assert test_gallery2["cover_photo_thumbnail_url"] is not None  # Cover photo URL should be present
        assert test_gallery2["cover_photo_thumbnail_url"].startswith("http")
        assert "recent_photo_thumbnail_urls" not in test_gallery2


class TestDownloadQuality:
    @pytest.mark.parametrize("quality", ["original", "publication"])
    @pytest.mark.parametrize("include_videos", [False, True])
    def test_zip_contains_requested_assets(self, authenticated_client, gallery_id_fixture, sync_engine, quality, include_videos):
        from tests.download_helpers import seed_download_scope, unpack_download

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        prefix, payloads = scope["prefix"], scope["payloads"]
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/download/all",
            params={"quality": quality, "include_videos": str(include_videos).lower()},
        )
        if quality == "publication":
            expected = {
                "same_publication.jpg": payloads[f"{prefix}/first_publication.jpg"],
                "same_publication (1).jpg": payloads[f"{prefix}/second_publication.jpg"],
            }
            assert response.headers["content-disposition"].endswith('_publication.zip"')
        else:
            expected = {"same.jpg": payloads[f"{prefix}/rotated.jpg"], "same.png": payloads[f"{prefix}/second.png"]}
            assert response.headers["content-disposition"].endswith(f'{gallery_id_fixture}.zip"')
        if include_videos:
            expected["clip.mp4"] = payloads[f"{prefix}/clip.mp4"]
        assert unpack_download(response) == expected

    @pytest.mark.parametrize("include_videos,original_size,publication_size", [(False, 10_000_000, 700_000), (True, 30_000_000, 20_700_000)])
    def test_estimates_match_scope_and_video_option(self, authenticated_client, gallery_id_fixture, sync_engine, include_videos, original_size, publication_size):
        from tests.download_helpers import seed_download_scope

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        params = {"include_videos": str(include_videos).lower()}
        all_response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/download/all/estimate", params=params)
        selected_response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/download/selected/estimate",
            params=params,
            json={"photo_ids": [str(photo_id) for photo_id in scope["ids"].values()]},
        )
        expected = {
            "image_count": 2,
            "video_count": int(include_videos),
            "available_video_count": 1,
            "original_size_bytes": original_size,
            "publication_size_bytes": publication_size,
            "publication_pending_count": 0,
        }
        assert all_response.status_code == selected_response.status_code == 200
        assert all_response.json() == selected_response.json() == expected
        single = authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{scope['ids']['first']}/download/estimate")
        assert single.json() == {
            "image_count": 1,
            "video_count": 0,
            "available_video_count": 0,
            "original_size_bytes": 6_000_000,
            "publication_size_bytes": 400_000,
            "publication_pending_count": 0,
        }

    def test_selected_validates_membership_before_filter_and_preserves_order(self, authenticated_client, gallery_id_fixture, sync_engine):
        from tests.download_helpers import seed_download_scope, unpack_download

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        ids = scope["ids"]
        url = f"/galleries/{gallery_id_fixture}/download/selected"
        request = {"photo_ids": [str(ids[name]) for name in ("second", "first", "second", "unfinished")]}
        response = authenticated_client.post(url, params={"quality": "publication"}, json=request)
        contents = unpack_download(response)
        assert list(contents) == ["same_publication.jpg", "same_publication (1).jpg"]
        assert list(contents.values()) == [
            scope["payloads"][f"{scope['prefix']}/second_publication.jpg"],
            scope["payloads"][f"{scope['prefix']}/first_publication.jpg"],
        ]
        for suffix in ("", "/estimate"):
            missing = authenticated_client.post(url + suffix, json={"photo_ids": [str(ids["unfinished"]), str(uuid4())]})
            assert missing.status_code == 404
            assert missing.json()["detail"] == "One or more selected photos were not found"
        unfinished = str(ids["unfinished"])
        assert authenticated_client.post(f"/galleries/{gallery_id_fixture}/photos/{unfinished}/download").status_code == 404
        assert authenticated_client.get(f"/galleries/{gallery_id_fixture}/photos/{unfinished}/download/estimate").status_code == 404
        empty = authenticated_client.post(url + "/estimate", json={"photo_ids": [unfinished]})
        assert empty.status_code == 200
        assert empty.json() == {
            "image_count": 0,
            "video_count": 0,
            "available_video_count": 0,
            "original_size_bytes": 0,
            "publication_size_bytes": 0,
            "publication_pending_count": 0,
        }
        assert authenticated_client.post(url, json={"photo_ids": [unfinished]}).status_code == 404

    def test_missing_publication_never_falls_back_to_original(self, authenticated_client, gallery_id_fixture, sync_engine):
        from sqlalchemy.orm import Session

        from tests.download_helpers import seed_download_scope, unpack_download
        from viewport.models.gallery import Photo

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        with Session(sync_engine) as db:
            photo = db.get(Photo, scope["ids"]["first"])
            photo.publication_object_key = photo.publication_file_size = None
            db.commit()
        estimate = authenticated_client.get(f"/galleries/{gallery_id_fixture}/download/all/estimate").json()
        assert estimate["publication_size_bytes"] is None
        assert estimate["publication_pending_count"] == 1
        url = f"/galleries/{gallery_id_fixture}/download/all"
        assert len(unpack_download(authenticated_client.post(url))) == 3
        for path, body in [
            (url, None),
            (f"/galleries/{gallery_id_fixture}/download/selected", {"photo_ids": [str(scope["ids"]["first"])]}),
            (f"/galleries/{gallery_id_fixture}/photos/{scope['ids']['first']}/download", None),
        ]:
            response = authenticated_client.post(path, params={"quality": "publication"}, json=body, follow_redirects=False)
            assert response.status_code == 409
            assert response.json()["detail"] == "Publication files are not ready"

    def test_single_publication_redirect_and_video_original(self, authenticated_client, gallery_id_fixture, sync_engine):
        from tests.download_helpers import seed_download_scope

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        with patch("viewport.api.photo.AsyncS3Client.generate_presigned_url_async", new_callable=AsyncMock, return_value="https://example.test/file") as presign:
            for name, key, filename in [
                ("first", "first_publication.jpg", "same_publication.jpg"),
                ("video", "clip.mp4", "clip.mp4"),
            ]:
                response = authenticated_client.post(
                    f"/galleries/{gallery_id_fixture}/photos/{scope['ids'][name]}/download?quality=publication",
                    follow_redirects=False,
                )
                assert response.status_code == 303
                assert presign.await_args.args[0] == f"{scope['prefix']}/{key}"
                assert presign.await_args.kwargs["response_content_disposition"] == f'attachment; filename="{filename}"'

    def test_pending_rotation_checks_only_included_successful_records(self, authenticated_client, gallery_id_fixture, sync_engine):
        from sqlalchemy.orm import Session

        from tests.download_helpers import seed_download_scope
        from viewport.models.gallery import Photo

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        with Session(sync_engine) as db:
            db.get(Photo, scope["ids"]["video"]).rotation_status = "pending"
            db.get(Photo, scope["ids"]["unfinished"]).rotation_status = "pending"
            db.commit()
        base = f"/galleries/{gallery_id_fixture}/download/all"
        assert authenticated_client.get(base + "/estimate?include_videos=false").status_code == 200
        assert authenticated_client.post(base + "?include_videos=false").status_code == 200
        assert authenticated_client.get(base + "/estimate").status_code == 409
        assert authenticated_client.post(base).status_code == 409
        with Session(sync_engine) as db:
            db.get(Photo, scope["ids"]["first"]).rotation_status = "processing"
            db.commit()
        assert authenticated_client.get(base + "/estimate?include_videos=false").status_code == 409
        assert authenticated_client.post(base + "?include_videos=false").status_code == 409

    def test_estimate_uses_entire_collection_not_first_page(self, authenticated_client, gallery_id_fixture, sync_engine):
        from uuid import UUID

        from sqlalchemy.orm import Session

        from viewport.models.gallery import Photo, PhotoUploadStatus

        with Session(sync_engine) as db:
            db.add_all(
                [
                    Photo(
                        gallery_id=UUID(gallery_id_fixture),
                        object_key=f"{gallery_id_fixture}/{index}.jpg",
                        thumbnail_object_key=f"{gallery_id_fixture}/{index}_thumbnail.avif",
                        display_name=f"{index}.jpg",
                        file_size=100,
                        status=PhotoUploadStatus.SUCCESSFUL,
                    )
                    for index in range(125)
                ]
            )
            db.commit()
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/download/all/estimate")
        assert response.status_code == 200
        assert response.json() == {
            "image_count": 125,
            "video_count": 0,
            "available_video_count": 0,
            "original_size_bytes": 12_500,
            "publication_size_bytes": None,
            "publication_pending_count": 125,
        }

    @pytest.mark.parametrize("query", ["quality=bogus", "include_videos=bogus"])
    def test_invalid_download_options_are_rejected(self, authenticated_client, gallery_id_fixture, query):
        assert authenticated_client.post(f"/galleries/{gallery_id_fixture}/download/all?{query}").status_code == 422
        if query.startswith("include"):
            assert authenticated_client.get(f"/galleries/{gallery_id_fixture}/download/all/estimate?{query}").status_code == 422

    def test_zip_stream_closes_every_s3_body(self, authenticated_client, gallery_id_fixture, sync_engine):
        from tests.download_helpers import seed_download_scope, unpack_download

        seed_download_scope(sync_engine, gallery_id_fixture)
        share = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json={}).json()["id"]
        for method, url, client_path in [
            ("post", f"/galleries/{gallery_id_fixture}/download/all", "viewport.api.gallery.get_sync_s3_client"),
            ("get", f"/s/{share}/download/all", "viewport.api.public.get_s3_client"),
        ]:
            bodies: list[io.BytesIO] = []
            captured_bodies = bodies

            def get_object(_client_path=client_path, _bodies=captured_bodies, **_kwargs):
                body = io.BytesIO(b"streamed-object")
                _bodies.append(body)
                return {"Body": body}

            with patch(client_path) as get_client:
                get_client.return_value.get_object.side_effect = get_object
                entries = unpack_download(getattr(authenticated_client, method)(url))
            assert len(entries) == 3
            assert set(entries.values()) == {b"streamed-object"}
            assert bodies and all(body.closed for body in bodies)

    def test_zip_stream_closes_s3_body_after_read_failure(self, authenticated_client, gallery_id_fixture, sync_engine):
        from tests.download_helpers import seed_download_scope

        seed_download_scope(sync_engine, gallery_id_fixture)

        class FailedBody(io.BytesIO):
            def read(self, _size=-1):
                raise OSError("stream read failed")

        body = FailedBody(b"unread")
        with patch("viewport.api.gallery.get_sync_s3_client") as get_client:
            get_client.return_value.get_object.return_value = {"Body": body}
            with pytest.raises(OSError, match="stream read failed"):
                authenticated_client.post(f"/galleries/{gallery_id_fixture}/download/all")
        assert body.closed

    def test_estimates_require_bearer_auth_not_download_form_token(self, client, auth_token):
        client.headers["Authorization"] = f"Bearer {auth_token}"
        gallery_id = client.post("/galleries", json={}).json()["id"]
        client.headers.pop("Authorization")
        response = client.get(f"/galleries/{gallery_id}/download/all/estimate?access_token={auth_token}")
        assert response.status_code == 401
        response = client.post(
            f"/galleries/{gallery_id}/download/selected/estimate",
            json={"photo_ids": [str(uuid4())], "access_token": auth_token},
        )
        assert response.status_code == 401

    def test_gallery_publication_trigger_enqueues_missing_and_skips_ready(self, authenticated_client, gallery_id_fixture, sync_engine):
        from sqlalchemy.orm import Session

        from tests.download_helpers import seed_download_scope
        from viewport.models.gallery import Photo

        scope = seed_download_scope(sync_engine, gallery_id_fixture)
        with Session(sync_engine) as db:
            db.get(Photo, scope["ids"]["second"]).publication_object_key = None
            db.get(Photo, scope["ids"]["second"]).publication_file_size = None
            db.commit()
        enqueued = []
        with patch("viewport.publication_tasks.create_publication_images_batch_task") as task:
            task.delay.side_effect = lambda batch: enqueued.append(batch)
            response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/publication")
        assert response.status_code == 200
        assert response.json() == {"requested_count": 1, "skipped_count": 1}
        assert enqueued == [[str(scope["ids"]["second"])]]

    def test_gallery_publication_trigger_returns_404_when_all_ready(self, authenticated_client, gallery_id_fixture, sync_engine):
        from tests.download_helpers import seed_download_scope

        seed_download_scope(sync_engine, gallery_id_fixture)
        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/publication")
        assert response.status_code == 404
        assert response.json()["detail"] == "No photos found"

    def test_gallery_publication_trigger_requires_owner(self, client, gallery_id_fixture):
        assert client.post(f"/galleries/{gallery_id_fixture}/publication").status_code in (401, 403, 404)

    def test_gallery_publication_trigger_unknown_gallery_404(self, authenticated_client):
        response = authenticated_client.post(f"/galleries/{uuid4()}/publication")
        assert response.status_code == 404
        assert response.json()["detail"] == "Gallery not found"
