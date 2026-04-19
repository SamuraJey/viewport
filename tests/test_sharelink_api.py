"""Tests for sharelink API endpoints."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.helpers import register_and_login
from viewport.repositories.project_repository import ProjectRepository
from viewport.schemas.sharelink import GalleryShareLinkResponse


class TestSharelinkAPI:
    """Test sharelink API endpoints with comprehensive coverage."""

    def test_create_sharelink_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful sharelink creation."""
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "gallery_id" not in data
        assert data["label"] is None
        assert data["is_active"] is True
        assert "expires_at" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert data["views"] == 0
        assert data["single_downloads"] == 0
        assert data["zip_downloads"] == 0

    def test_list_sharelinks_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test listing sharelinks for a gallery."""
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"expires_at": expires_at},
        )

        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}/share-links")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert GalleryShareLinkResponse(**data[0]).expires_at.isoformat() == expires_at.replace(
            "+00:00",
            "",
        )
        assert data[0]["is_active"] is True
        assert "gallery_id" not in data[0]

    def test_list_sharelinks_gallery_not_found(self, authenticated_client: TestClient):
        """Test listing sharelinks for non-existent gallery."""
        fake_gallery_id = str(uuid4())
        response = authenticated_client.get(f"/galleries/{fake_gallery_id}/share-links")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_sharelink_no_expiration(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink without expiration date."""
        payload = {"expires_at": None, "gallery_id": gallery_id_fixture}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["is_active"] is True
        assert data["expires_at"] is None

    def test_update_sharelink_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        expires_at = (datetime.now(UTC) + timedelta(days=5)).isoformat()
        create_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"expires_at": expires_at, "label": "Old label"},
        )
        assert create_resp.status_code == 201
        sharelink_id = create_resp.json()["id"]

        updated_expires_at = (datetime.now(UTC) + timedelta(days=10)).isoformat()
        update_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}",
            json={"label": "Preview for Ivan", "is_active": False, "expires_at": updated_expires_at},
        )

        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["label"] == "Preview for Ivan"
        assert data["is_active"] is False
        assert data["expires_at"].startswith(updated_expires_at[:19])

    def test_owner_sharelinks_dashboard_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        create_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Dashboard Link"},
        )
        assert create_resp.status_code == 201

        response = authenticated_client.get("/share-links?page=1&size=20")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert data["page"] == 1
        assert data["size"] == 20
        assert isinstance(data["share_links"], list)
        assert data["share_links"][0]["gallery_id"] == gallery_id_fixture
        assert "gallery_name" in data["share_links"][0]
        assert "selection_summary" in data["share_links"][0]
        assert {"is_enabled", "status", "selected_count", "total_sessions"} <= set(data["share_links"][0]["selection_summary"].keys())
        assert "summary" in data
        assert {"views", "zip_downloads", "single_downloads", "active_links"} <= set(data["summary"].keys())

    def test_owner_sharelinks_dashboard_search_applies_before_pagination(self, authenticated_client: TestClient, gallery_id_fixture: str):
        first_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Needle Label"},
        )
        assert first_resp.status_code == 201

        second_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Other Label"},
        )
        assert second_resp.status_code == 201

        response = authenticated_client.get("/share-links?page=1&size=1&search=Needle")
        assert response.status_code == 200
        data = response.json()

        assert data["total"] == 1
        assert len(data["share_links"]) == 1
        assert data["share_links"][0]["label"] == "Needle Label"

    def test_owner_sharelinks_dashboard_filters_by_status(self, authenticated_client: TestClient, gallery_id_fixture: str):
        active_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Active Link"},
        )
        assert active_resp.status_code == 201

        inactive_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Inactive Link"},
        )
        assert inactive_resp.status_code == 201
        inactive_id = inactive_resp.json()["id"]
        patch_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{inactive_id}",
            json={"is_active": False},
        )
        assert patch_resp.status_code == 200

        response = authenticated_client.get("/share-links?page=1&size=20&status=inactive")
        assert response.status_code == 200
        data = response.json()

        assert data["total"] == 1
        assert len(data["share_links"]) == 1
        assert data["share_links"][0]["label"] == "Inactive Link"

    def test_update_sharelink_rejects_null_is_active(self, authenticated_client: TestClient, gallery_id_fixture: str):
        create_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Needs update"},
        )
        assert create_resp.status_code == 201
        sharelink_id = create_resp.json()["id"]

        response = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}",
            json={"is_active": None},
        )
        assert response.status_code == 422

    def test_sharelink_analytics_endpoint_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        create_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Analytics Link"},
        )
        assert create_resp.status_code == 201
        sharelink_id = create_resp.json()["id"]

        response = authenticated_client.get(f"/share-links/{sharelink_id}/analytics?days=7")
        assert response.status_code == 200
        data = response.json()
        assert data["share_link"]["id"] == sharelink_id
        assert data["share_link"]["gallery_id"] == gallery_id_fixture
        assert "selection_summary" in data
        assert {"is_enabled", "status", "selected_count", "total_sessions"} <= set(data["selection_summary"].keys())
        assert len(data["points"]) == 7
        assert {"day", "views_total", "views_unique", "zip_downloads", "single_downloads"} <= set(data["points"][0].keys())

    def test_create_sharelink_gallery_not_found(self, authenticated_client: TestClient):
        """Test creating sharelink for non-existent gallery."""
        fake_uuid = str(uuid4())
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": fake_uuid}

        response = authenticated_client.post(f"/galleries/{fake_uuid}/share-links", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_sharelink_unauthorized(self, client: TestClient):
        """Test creating sharelink without authentication."""
        # Use a fake gallery ID that doesn't exist
        fake_gallery_id = str(uuid4())
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at, "gallery_id": fake_gallery_id}

        response = client.post(f"/galleries/{fake_gallery_id}/share-links", json=payload)
        assert response.status_code == 401

    def test_create_sharelink_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink for gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}

        response = client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_sharelink_invalid_expiration(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating sharelink with invalid expiration date format."""
        payload = {"expires_at": "invalid-date"}

        response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert response.status_code == 422

    def test_delete_sharelink_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful sharelink deletion."""
        # Create a sharelink first
        expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"expires_at": expires_at}

        create_response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert create_response.status_code == 201
        sharelink_id = create_response.json()["id"]

        # Delete the sharelink
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}")
        assert response.status_code == 204

    def test_delete_sharelink_not_found(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test deleting non-existent sharelink."""
        fake_sharelink_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_sharelink_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting sharelink from non-existent gallery."""
        fake_gallery_id = str(uuid4())
        fake_sharelink_id = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{fake_gallery_id}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_sharelink_unauthorized(self, client: TestClient):
        """Test deleting sharelink without authentication."""
        fake_gallery_id = str(uuid4())
        fake_sharelink_id = str(uuid4())
        response = client.delete(f"/galleries/{fake_gallery_id}/share-links/{fake_sharelink_id}")
        assert response.status_code == 401

    def test_list_sharelink_unauthorized(self, client: TestClient):
        """Test listing sharelinks without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.get(f"/galleries/{fake_gallery_id}/share-links")
        assert response.status_code == 401

    def test_delete_sharelink_different_user_gallery(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting sharelink from gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123", "testinvitecode")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        fake_sharelink_id = str(uuid4())
        response = client.delete(f"/galleries/{gallery_id_fixture}/share-links/{fake_sharelink_id}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_multiple_sharelinks_per_gallery(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test creating multiple sharelinks for the same gallery."""
        sharelink_ids = []
        for i in range(3):
            expires_at = (datetime.now(UTC) + timedelta(days=i + 1)).isoformat()
            payload = {"expires_at": expires_at}

            response = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
            assert response.status_code == 201
            sharelink_ids.append(response.json()["id"])

        # Verify all sharelinks are unique
        assert len(set(sharelink_ids)) == 3

        # Delete one sharelink
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_ids[0]}")
        assert response.status_code == 204

        # Verify other sharelinks still exist by attempting to delete them
        for sharelink_id in sharelink_ids[1:]:
            response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}/share-links/{sharelink_id}")
            assert response.status_code == 204

    def test_project_sharelink_endpoints_cover_missing_resource_and_validation_branches(
        self,
        authenticated_client: TestClient,
    ):
        fake_project_id = str(uuid4())
        fake_sharelink_id = str(uuid4())

        missing_list_resp = authenticated_client.get(f"/projects/{fake_project_id}/share-links")
        assert missing_list_resp.status_code == 404
        assert missing_list_resp.json()["detail"] == "Project not found"

        missing_create_resp = authenticated_client.post(
            f"/projects/{fake_project_id}/share-links",
            json={"label": "Missing project"},
        )
        assert missing_create_resp.status_code == 404
        assert missing_create_resp.json()["detail"] == "Project not found"

        project_resp = authenticated_client.post("/projects", json={"name": "Project Sharelinks"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        create_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "  Delivery Preview  "},
        )
        assert create_resp.status_code == 201
        sharelink_id = create_resp.json()["id"]
        assert create_resp.json()["label"] == "Delivery Preview"

        list_resp = authenticated_client.get(f"/projects/{project_id}/share-links")
        assert list_resp.status_code == 200
        assert list_resp.json()[0]["selection_summary"]["status"] == "not_started"

        invalid_update_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{sharelink_id}",
            json={"is_active": None},
        )
        assert invalid_update_resp.status_code == 422

        trimmed_update_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{sharelink_id}",
            json={"label": "  Client Delivery  "},
        )
        assert trimmed_update_resp.status_code == 200
        assert trimmed_update_resp.json()["label"] == "Client Delivery"

        missing_update_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{fake_sharelink_id}",
            json={"label": "missing"},
        )
        assert missing_update_resp.status_code == 404
        assert missing_update_resp.json()["detail"] == "Share link not found"

        missing_delete_resp = authenticated_client.delete(
            f"/projects/{project_id}/share-links/{fake_sharelink_id}",
        )
        assert missing_delete_resp.status_code == 404
        assert missing_delete_resp.json()["detail"] == "Share link not found"

        analytics_missing_resp = authenticated_client.get(f"/share-links/{fake_sharelink_id}/analytics?days=7")
        assert analytics_missing_resp.status_code == 404
        assert analytics_missing_resp.json()["detail"] == "Share link not found"

        delete_resp = authenticated_client.delete(f"/projects/{project_id}/share-links/{sharelink_id}")
        assert delete_resp.status_code == 204

    def test_project_sharelink_update_surfaces_repository_value_errors(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Project Errors"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        share_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "Project link"},
        )
        assert share_resp.status_code == 201
        sharelink_id = share_resp.json()["id"]

        async def _raise_value_error(*args, **kwargs):
            raise ValueError("invalid project share link update")

        monkeypatch.setattr(ProjectRepository, "update_project_sharelink", _raise_value_error)

        response = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{sharelink_id}",
            json={"label": "Updated"},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "invalid project share link update"
