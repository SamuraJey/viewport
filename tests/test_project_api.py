from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.helpers import upload_photo_via_presigned

pytestmark = pytest.mark.requires_s3


class TestProjectAPI:
    def test_create_project_and_folder_and_filter_standalone_galleries(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post(
            "/projects",
            json={"name": "Wedding A", "shooting_date": "2026-04-18"},
        )
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        folder_resp = authenticated_client.post(
            f"/projects/{project_id}/folders",
            json={"name": "Ceremony", "project_visibility": "listed"},
        )
        assert folder_resp.status_code == 201
        folder_id = folder_resp.json()["id"]
        assert folder_resp.json()["project_id"] == project_id
        assert folder_resp.json()["project_name"] == "Wedding A"

        standalone_resp = authenticated_client.post("/galleries", json={"name": "Standalone"})
        assert standalone_resp.status_code == 201
        standalone_id = standalone_resp.json()["id"]

        galleries_resp = authenticated_client.get("/galleries?standalone_only=true")
        assert galleries_resp.status_code == 200
        returned_ids = [gallery["id"] for gallery in galleries_resp.json()["galleries"]]
        assert standalone_id in returned_ids
        assert folder_id not in returned_ids

        detail_resp = authenticated_client.get(f"/projects/{project_id}")
        assert detail_resp.status_code == 200
        payload = detail_resp.json()
        assert payload["name"] == "Wedding A"
        assert payload["folder_count"] == 1
        assert payload["folders"][0]["id"] == folder_id

    def test_project_share_hides_direct_only_folders_but_direct_folder_share_works(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Wedding B"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        listed_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/folders",
            json={"name": "Portraits", "project_visibility": "listed"},
        )
        hidden_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/folders",
            json={"name": "Backstage", "project_visibility": "direct_only"},
        )
        assert listed_folder_resp.status_code == 201
        assert hidden_folder_resp.status_code == 201
        listed_folder_id = listed_folder_resp.json()["id"]
        hidden_folder_id = hidden_folder_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, listed_folder_id, b"listed", "listed.jpg")
        upload_photo_via_presigned(authenticated_client, hidden_folder_id, b"hidden", "hidden.jpg")

        project_share_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        )
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        public_project_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert public_project_resp.status_code == 200
        public_project_payload = public_project_resp.json()
        assert public_project_payload["scope_type"] == "project"
        returned_folder_ids = [folder["folder_id"] for folder in public_project_payload["folders"]]
        assert listed_folder_id in returned_folder_ids
        assert hidden_folder_id not in returned_folder_ids

        visible_folder_resp = authenticated_client.get(f"/s/{project_share_id}/folders/{listed_folder_id}")
        assert visible_folder_resp.status_code == 200
        assert visible_folder_resp.json()["scope_type"] == "gallery"
        assert visible_folder_resp.json()["gallery_name"] == "Portraits"

        hidden_folder_public_resp = authenticated_client.get(f"/s/{project_share_id}/folders/{hidden_folder_id}")
        assert hidden_folder_public_resp.status_code == 404

        direct_hidden_share_resp = authenticated_client.post(
            f"/galleries/{hidden_folder_id}/share-links",
            json={"expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        )
        assert direct_hidden_share_resp.status_code == 201
        hidden_share_id = direct_hidden_share_resp.json()["id"]

        direct_hidden_public_resp = authenticated_client.get(f"/s/{hidden_share_id}")
        assert direct_hidden_public_resp.status_code == 200
        assert direct_hidden_public_resp.json()["scope_type"] == "gallery"
        assert direct_hidden_public_resp.json()["gallery_name"] == "Backstage"

    def test_share_links_dashboard_includes_project_scope_and_project_name_search(self, authenticated_client: TestClient, gallery_id_fixture: str):
        project_resp = authenticated_client.post("/projects", json={"name": "Campaign X"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        folder_link_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"label": "Folder Preview"},
        )
        project_link_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "Project Preview"},
        )
        assert folder_link_resp.status_code == 201
        assert project_link_resp.status_code == 201

        dashboard_resp = authenticated_client.get("/share-links?page=1&size=20")
        assert dashboard_resp.status_code == 200
        items = dashboard_resp.json()["share_links"]
        assert any(item["scope_type"] == "gallery" for item in items)
        assert any(item["scope_type"] == "project" for item in items)
        project_item = next(item for item in items if item["scope_type"] == "project")
        assert project_item["project_name"] == "Campaign X"
        assert project_item["selection_summary"] is None

        search_resp = authenticated_client.get("/share-links?page=1&size=20&search=Campaign")
        assert search_resp.status_code == 200
        search_items = search_resp.json()["share_links"]
        assert len(search_items) == 1
        assert search_items[0]["scope_type"] == "project"

    def test_selection_endpoints_return_404_for_project_share_links(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "No Selection Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        selection_resp = authenticated_client.get(f"/s/{project_share_id}/selection/config")
        assert selection_resp.status_code == 404

    def test_project_folder_navigation_does_not_double_count_project_share_views(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Analytics Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        folder_resp = authenticated_client.post(
            f"/projects/{project_id}/folders",
            json={"name": "Delivery", "project_visibility": "listed"},
        )
        assert folder_resp.status_code == 201
        folder_id = folder_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, folder_id, b"folder", "folder.jpg")

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        landing_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert landing_resp.status_code == 200
        nested_folder_resp = authenticated_client.get(f"/s/{project_share_id}/folders/{folder_id}")
        assert nested_folder_resp.status_code == 200

        analytics_resp = authenticated_client.get(f"/share-links/{project_share_id}/analytics?days=30")
        assert analytics_resp.status_code == 200
        analytics_payload = analytics_resp.json()
        assert analytics_payload["share_link"]["scope_type"] == "project"
        assert analytics_payload["share_link"]["views"] == 1
        assert analytics_payload["points"][-1]["views_total"] == 1
