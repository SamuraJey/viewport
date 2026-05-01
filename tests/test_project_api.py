from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.helpers import upload_photo_via_presigned

pytestmark = pytest.mark.requires_s3


class TestProjectAPI:
    def test_list_projects_supports_sorting_fields_and_order(self, authenticated_client: TestClient):
        empty_project_resp = authenticated_client.post(
            "/projects",
            json={"name": "Alpha Empty", "shooting_date": "2026-04-20"},
        )
        assert empty_project_resp.status_code == 201
        empty_project_id = empty_project_resp.json()["id"]

        hidden_project_resp = authenticated_client.post(
            "/projects",
            json={"name": "Beta Hidden", "shooting_date": "2026-04-18"},
        )
        assert hidden_project_resp.status_code == 201
        hidden_project_id = hidden_project_resp.json()["id"]

        hidden_folder_resp = authenticated_client.post(
            f"/projects/{hidden_project_id}/galleries",
            json={"name": "Direct Only", "project_visibility": "direct_only"},
        )
        assert hidden_folder_resp.status_code == 201
        hidden_folder_id = hidden_folder_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, hidden_folder_id, b"first hidden", "first.jpg")
        upload_photo_via_presigned(authenticated_client, hidden_folder_id, b"second hidden", "second.jpg")

        name_resp = authenticated_client.get("/projects?page=1&size=20&sort_by=name&order=asc")
        assert name_resp.status_code == 200
        assert [project["id"] for project in name_resp.json()["projects"][:2]] == [
            empty_project_id,
            hidden_project_id,
        ]

        shooting_resp = authenticated_client.get("/projects?page=1&size=20&sort_by=shooting_date&order=asc")
        assert shooting_resp.status_code == 200
        assert [project["id"] for project in shooting_resp.json()["projects"][:2]] == [
            hidden_project_id,
            empty_project_id,
        ]

        photo_count_resp = authenticated_client.get("/projects?page=1&size=1&sort_by=photo_count&order=desc")
        assert photo_count_resp.status_code == 200
        photo_count_project = photo_count_resp.json()["projects"][0]
        assert photo_count_project["id"] == hidden_project_id
        assert photo_count_project["visible_gallery_count"] == 0
        assert photo_count_project["total_photo_count"] == 2

        size_resp = authenticated_client.get("/projects?page=1&size=1&sort_by=total_size_bytes&order=desc")
        assert size_resp.status_code == 200
        assert size_resp.json()["projects"][0]["id"] == hidden_project_id

        invalid_resp = authenticated_client.get("/projects?sort_by=not_a_field&order=desc")
        assert invalid_resp.status_code == 422

    def test_create_project_starts_empty_and_legacy_gallery_create_auto_wraps(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post(
            "/projects",
            json={"name": "Wedding A", "shooting_date": "2026-04-18"},
        )
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]
        assert project_payload["entry_gallery_id"] is None
        assert project_payload["entry_gallery_name"] is None
        assert project_payload["gallery_count"] == 0
        assert project_payload["visible_gallery_count"] == 0
        assert project_payload["has_entry_gallery"] is False

        gallery_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Ceremony", "project_visibility": "listed"},
        )
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]
        assert gallery_resp.json()["project_id"] == project_id
        assert gallery_resp.json()["project_name"] == "Wedding A"

        standalone_resp = authenticated_client.post("/galleries", json={"name": "Standalone"})
        assert standalone_resp.status_code == 201
        standalone_payload = standalone_resp.json()
        standalone_id = standalone_payload["id"]
        standalone_project_id = standalone_payload["project_id"]
        assert standalone_project_id is not None

        galleries_resp = authenticated_client.get("/galleries?standalone_only=true")
        assert galleries_resp.status_code == 200
        returned_ids = [gallery["id"] for gallery in galleries_resp.json()["galleries"]]
        assert standalone_id not in returned_ids
        assert gallery_id not in returned_ids

        detail_resp = authenticated_client.get(f"/projects/{project_id}")
        assert detail_resp.status_code == 200
        payload = detail_resp.json()
        assert payload["name"] == "Wedding A"
        assert payload["entry_gallery_id"] == gallery_id
        assert payload["gallery_count"] == 1
        assert "folder_count" not in payload
        assert "recent_folder_thumbnail_urls" not in payload
        assert payload["cover_photo_thumbnail_url"] is None
        assert [gallery["id"] for gallery in payload["galleries"]] == [gallery_id]

        gallery_detail_resp = authenticated_client.get(f"/galleries/{gallery_id}")
        assert gallery_detail_resp.status_code == 200
        gallery_detail_payload = gallery_detail_resp.json()
        assert gallery_detail_payload["project_id"] == project_id
        assert gallery_detail_payload["project_name"] == "Wedding A"
        assert gallery_detail_payload["project_visibility"] == "listed"

        wrapped_detail_resp = authenticated_client.get(f"/projects/{standalone_project_id}")
        assert wrapped_detail_resp.status_code == 200
        wrapped_payload = wrapped_detail_resp.json()
        assert wrapped_payload["entry_gallery_id"] == standalone_id
        assert wrapped_payload["gallery_count"] == 1

        upload_photo_via_presigned(authenticated_client, gallery_id, b"project-cover", "cover.jpg")

        list_resp = authenticated_client.get("/projects?page=1&size=20")
        assert list_resp.status_code == 200
        listed_items = {item["id"]: item for item in list_resp.json()["projects"]}
        assert listed_items[project_id]["entry_gallery_id"] == gallery_id
        assert listed_items[project_id]["cover_photo_thumbnail_url"].startswith("http")
        assert "recent_folder_thumbnail_urls" not in listed_items[project_id]
        assert listed_items[standalone_project_id]["entry_gallery_id"] == standalone_id

    def test_project_missing_resource_and_empty_state_branches(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        deleted_gallery_ids: list[str] = []
        monkeypatch.setattr(
            "viewport.api.project.delete_gallery_data_task.delay",
            lambda gallery_id: deleted_gallery_ids.append(gallery_id),
        )
        missing_project_id = uuid4()

        missing_detail_resp = authenticated_client.get(f"/projects/{missing_project_id}")
        assert missing_detail_resp.status_code == 404
        assert missing_detail_resp.json()["detail"] == "Project not found"

        missing_update_resp = authenticated_client.patch(
            f"/projects/{missing_project_id}",
            json={"name": "Rename"},
        )
        assert missing_update_resp.status_code == 404
        assert missing_update_resp.json()["detail"] == "Project not found"

        missing_delete_resp = authenticated_client.delete(f"/projects/{missing_project_id}")
        assert missing_delete_resp.status_code == 404
        assert missing_delete_resp.json()["detail"] == "Project not found"

        missing_folder_resp = authenticated_client.post(
            f"/projects/{missing_project_id}/galleries",
            json={"name": "Child"},
        )
        assert missing_folder_resp.status_code == 404
        assert missing_folder_resp.json()["detail"] == "Project not found"

        project_resp = authenticated_client.post("/projects", json={"name": "Empty Later"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]
        assert project_payload["entry_gallery_id"] is None

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        delete_project_resp = authenticated_client.delete(f"/projects/{project_id}")
        assert delete_project_resp.status_code == 204
        assert deleted_gallery_ids == []

        deleted_project_detail_resp = authenticated_client.get(f"/projects/{project_id}")
        assert deleted_project_detail_resp.status_code == 404

        deleted_project_share_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert deleted_project_share_resp.status_code == 404

    def test_update_project_success(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Before Rename"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        update_resp = authenticated_client.patch(
            f"/projects/{project_id}",
            json={"name": "After Rename", "shooting_date": "2026-04-20"},
        )

        assert update_resp.status_code == 200
        payload = update_resp.json()
        assert payload["name"] == "After Rename"
        assert payload["shooting_date"] == "2026-04-20"

    def test_project_share_hides_direct_only_folders_but_direct_folder_share_works(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Wedding B"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]
        listed_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Portraits", "project_visibility": "listed"},
        )
        hidden_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Backstage", "project_visibility": "direct_only"},
        )
        assert listed_folder_resp.status_code == 201
        assert hidden_folder_resp.status_code == 201
        listed_folder_id = listed_folder_resp.json()["id"]
        hidden_folder_id = hidden_folder_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, listed_folder_id, b"listed", "listed.jpg")
        upload_photo_via_presigned(authenticated_client, hidden_folder_id, b"hidden-hidden", "hidden.jpg")
        listed_detail_resp = authenticated_client.get(f"/galleries/{listed_folder_id}")
        hidden_detail_resp = authenticated_client.get(f"/galleries/{hidden_folder_id}")
        assert listed_detail_resp.status_code == 200
        assert hidden_detail_resp.status_code == 200
        listed_total_size = listed_detail_resp.json()["total_size_bytes"]
        hidden_total_size = hidden_detail_resp.json()["total_size_bytes"]

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
        assert public_project_payload["project_name"] == "Wedding B"
        assert public_project_payload["total_listed_folders"] == 1
        assert public_project_payload["total_size_bytes"] == listed_total_size
        assert public_project_payload["total_size_bytes"] != listed_total_size + hidden_total_size
        assert [folder["folder_id"] for folder in public_project_payload["folders"]] == [listed_folder_id]
        assert public_project_payload["folders"][0]["route_path"] == f"/share/{project_share_id}/galleries/{listed_folder_id}"

        visible_folder_resp = authenticated_client.get(f"/s/{project_share_id}/galleries/{listed_folder_id}")
        assert visible_folder_resp.status_code == 200
        visible_folder_payload = visible_folder_resp.json()
        assert visible_folder_payload["scope_type"] == "gallery"
        assert visible_folder_payload["gallery_name"] == "Portraits"
        assert visible_folder_payload["total_size_bytes"] == listed_total_size
        assert visible_folder_payload["project_navigation"]["total_size_bytes"] == listed_total_size

        hidden_folder_public_resp = authenticated_client.get(f"/s/{project_share_id}/galleries/{hidden_folder_id}")
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

    def test_public_project_share_returns_404_when_zero_visible_galleries(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Invisible Project"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]
        hidden_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Hidden", "project_visibility": "direct_only"},
        )
        assert hidden_folder_resp.status_code == 201

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        public_project_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert public_project_resp.status_code == 404

    def test_patch_gallery_with_null_project_id_rewraps_into_new_project(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Detach Project"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        source_project_id = project_payload["id"]

        gallery_resp = authenticated_client.post(
            f"/projects/{source_project_id}/galleries",
            json={"name": "Moves Out", "project_visibility": "listed"},
        )
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]

        detach_resp = authenticated_client.patch(
            f"/galleries/{gallery_id}",
            json={"project_id": None},
        )
        assert detach_resp.status_code == 200
        detached_payload = detach_resp.json()
        detached_project_id = detached_payload["project_id"]
        assert detached_project_id is not None
        assert detached_project_id != source_project_id

        source_detail_resp = authenticated_client.get(f"/projects/{source_project_id}")
        assert source_detail_resp.status_code == 200
        assert gallery_id not in [folder["id"] for folder in source_detail_resp.json()["galleries"]]

        detached_detail_resp = authenticated_client.get(f"/projects/{detached_project_id}")
        assert detached_detail_resp.status_code == 200
        detached_detail_payload = detached_detail_resp.json()
        assert detached_detail_payload["entry_gallery_id"] == gallery_id
        assert detached_detail_payload["gallery_count"] == 1

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
        assert project_item["selection_summary"] is not None
        assert project_item["selection_summary"]["is_enabled"] is False

        search_resp = authenticated_client.get("/share-links?page=1&size=20&search=Campaign")
        assert search_resp.status_code == 200
        search_items = search_resp.json()["share_links"]
        assert len(search_items) == 1
        assert search_items[0]["scope_type"] == "project"

    def test_project_warning_sharelinks_include_gallery_scoped_selection_summaries(
        self,
        authenticated_client: TestClient,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Warnings Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]
        gallery_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Direct proof", "project_visibility": "listed"},
        )
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]

        project_link_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "Project proof"},
        )
        gallery_link_resp = authenticated_client.post(
            f"/galleries/{gallery_id}/share-links",
            json={"label": "Direct proof"},
        )
        assert project_link_resp.status_code == 201
        assert gallery_link_resp.status_code == 201
        gallery_share_id = gallery_link_resp.json()["id"]

        config_resp = authenticated_client.patch(
            f"/galleries/{gallery_id}/share-links/{gallery_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert config_resp.status_code == 200

        session_resp = authenticated_client.post(
            f"/s/{gallery_share_id}/selection/session",
            json={"client_name": "Direct Proof Client"},
        )
        assert session_resp.status_code == 200

        warning_links_resp = authenticated_client.get(f"/projects/{project_id}/share-links/warnings")
        assert warning_links_resp.status_code == 200
        warning_links = warning_links_resp.json()

        assert {item["scope_type"] for item in warning_links} == {"project", "gallery"}
        gallery_warning_link = next(item for item in warning_links if item["scope_type"] == "gallery")
        assert gallery_warning_link["gallery_id"] == gallery_id
        assert gallery_warning_link["selection_summary"]["is_enabled"] is True
        assert gallery_warning_link["selection_summary"]["in_progress_sessions"] == 1

    def test_project_share_selection_supports_multi_gallery_picks(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        project_resp = authenticated_client.post("/projects", json={"name": "Project Selection"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        first_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Ceremony", "project_visibility": "listed"},
        )
        second_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Portraits", "project_visibility": "listed"},
        )
        hidden_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Backstage", "project_visibility": "direct_only"},
        )
        assert first_folder_resp.status_code == 201
        assert second_folder_resp.status_code == 201
        assert hidden_folder_resp.status_code == 201

        first_folder_id = first_folder_resp.json()["id"]
        second_folder_id = second_folder_resp.json()["id"]
        hidden_folder_id = hidden_folder_resp.json()["id"]

        first_photo_id = upload_photo_via_presigned(authenticated_client, first_folder_id, b"one", "one.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, second_folder_id, b"two", "two.jpg")
        hidden_photo_id = upload_photo_via_presigned(authenticated_client, hidden_folder_id, b"secret", "secret.jpg")

        project_share_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "Project proofing"},
        )
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        enable_selection_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{project_share_id}/selection-config",
            json={"is_enabled": True, "allow_photo_comments": True},
        )
        assert enable_selection_resp.status_code == 200
        assert enable_selection_resp.json()["is_enabled"] is True

        owner_project_links_resp = authenticated_client.get(f"/projects/{project_id}/share-links")
        assert owner_project_links_resp.status_code == 200
        assert owner_project_links_resp.json()[0]["selection_summary"]["is_enabled"] is True

        selection_resp = authenticated_client.get(f"/s/{project_share_id}/selection/config")
        assert selection_resp.status_code == 200
        assert selection_resp.json()["is_enabled"] is True

        start_resp = authenticated_client.post(
            f"/s/{project_share_id}/selection/session",
            json={"client_name": "Project Client"},
        )
        assert start_resp.status_code == 200
        resume_token = start_resp.json()["resume_token"]

        first_toggle_resp = authenticated_client.put(f"/s/{project_share_id}/selection/session/items/{first_photo_id}?resume_token={resume_token}")
        second_toggle_resp = authenticated_client.put(f"/s/{project_share_id}/selection/session/items/{second_photo_id}?resume_token={resume_token}")
        hidden_toggle_resp = authenticated_client.put(f"/s/{project_share_id}/selection/session/items/{hidden_photo_id}?resume_token={resume_token}")
        assert first_toggle_resp.status_code == 200
        assert second_toggle_resp.status_code == 200
        assert hidden_toggle_resp.status_code == 404

        session_resp = authenticated_client.get(f"/s/{project_share_id}/selection/session/me?resume_token={resume_token}")
        assert session_resp.status_code == 200
        assert session_resp.json()["selected_count"] == 2
        assert {item["gallery_name"] for item in session_resp.json()["items"]} == {
            "Ceremony",
            "Portraits",
        }

        selected_photos_resp = authenticated_client.get(
            f"/s/{project_share_id}/photos/by-ids",
            params=[("photo_ids", first_photo_id), ("photo_ids", second_photo_id)],
        )
        assert selected_photos_resp.status_code == 200
        assert [photo["filename"] for photo in selected_photos_resp.json()] == ["one.jpg", "two.jpg"]

        submit_resp = authenticated_client.post(f"/s/{project_share_id}/selection/session/submit?resume_token={resume_token}")
        assert submit_resp.status_code == 200
        assert submit_resp.json()["selected_count"] == 2

        detail_resp = authenticated_client.get(f"/share-links/{project_share_id}/selection")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["scope_type"] == "project"
        assert detail_resp.json()["aggregate"]["total_sessions"] == 1
        assert detail_resp.json()["aggregate"]["selected_count"] == 2

        session_detail_resp = authenticated_client.get(f"/share-links/{project_share_id}/selection/sessions/{start_resp.json()['id']}")
        assert session_detail_resp.status_code == 200
        assert {item["gallery_name"] for item in session_detail_resp.json()["items"]} == {
            "Ceremony",
            "Portraits",
        }

        files_csv_resp = authenticated_client.get(f"/share-links/{project_share_id}/selection/export/files.csv")
        assert files_csv_resp.status_code == 200
        assert "gallery_name,filename,comment" in files_csv_resp.text
        assert "Ceremony" in files_csv_resp.text
        assert "Portraits" in files_csv_resp.text

        lightroom_resp = authenticated_client.get(f"/share-links/{project_share_id}/selection/export/lightroom.txt")
        assert lightroom_resp.status_code == 200
        assert "Ceremony | one.jpg" in lightroom_resp.text
        assert "Portraits | two.jpg" in lightroom_resp.text

    def test_project_selection_config_uses_inactive_and_expired_share_semantics(
        self,
        authenticated_client: TestClient,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Selection Status Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        inactive_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert inactive_share_resp.status_code == 201
        inactive_share_id = inactive_share_resp.json()["id"]

        enable_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{inactive_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        disable_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{inactive_share_id}",
            json={"is_active": False},
        )
        assert disable_resp.status_code == 200

        inactive_selection_resp = authenticated_client.get(f"/s/{inactive_share_id}/selection/config")
        assert inactive_selection_resp.status_code == 404

        expired_share_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat()},
        )
        assert expired_share_resp.status_code == 201
        expired_share_id = expired_share_resp.json()["id"]

        expired_enable_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{expired_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert expired_enable_resp.status_code == 200

        expired_selection_resp = authenticated_client.get(f"/s/{expired_share_id}/selection/config")
        assert expired_selection_resp.status_code == 410

    def test_project_folder_navigation_does_not_double_count_project_share_views(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Analytics Project"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]

        gallery_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Delivery", "project_visibility": "listed"},
        )
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, gallery_id, b"gallery", "gallery.jpg")

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        landing_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert landing_resp.status_code == 200
        assert landing_resp.json()["scope_type"] == "project"
        assert landing_resp.json()["folders"][0]["route_path"] == f"/share/{project_share_id}/galleries/{gallery_id}"
        nested_gallery_resp = authenticated_client.get(
            f"/s/{project_share_id}/galleries/{gallery_id}",
            headers={"X-Viewport-Internal-Navigation": "1"},
        )
        assert nested_gallery_resp.status_code == 200
        assert nested_gallery_resp.json()["project_navigation"]["scope_type"] == "project"
        assert nested_gallery_resp.json()["project_navigation"]["project_name"] == "Analytics Project"

        analytics_resp = authenticated_client.get(f"/share-links/{project_share_id}/analytics?days=30")
        assert analytics_resp.status_code == 200
        analytics_payload = analytics_resp.json()
        assert analytics_payload["share_link"]["scope_type"] == "project"
        assert analytics_payload["share_link"]["views"] == 1
        assert analytics_payload["points"][-1]["views_total"] == 1

    def test_project_folder_deep_link_counts_project_share_view(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Deep Link Project"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]

        gallery_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Delivery", "project_visibility": "listed"},
        )
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]

        upload_photo_via_presigned(authenticated_client, gallery_id, b"gallery", "gallery.jpg")

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        deep_link_resp = authenticated_client.get(f"/s/{project_share_id}/galleries/{gallery_id}")
        assert deep_link_resp.status_code == 200

        analytics_resp = authenticated_client.get(f"/share-links/{project_share_id}/analytics?days=30")
        assert analytics_resp.status_code == 200
        analytics_payload = analytics_resp.json()
        assert analytics_payload["share_link"]["views"] == 1
        assert analytics_payload["points"][-1]["views_total"] == 1

    def test_reorder_project_galleries_endpoint_updates_positions_atomically(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Atomic Reorder"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]

        entry_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Entry", "project_visibility": "listed"},
        )
        first_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "First extra", "project_visibility": "listed"},
        )
        second_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Second extra", "project_visibility": "listed"},
        )
        assert entry_folder_resp.status_code == 201
        assert first_folder_resp.status_code == 201
        assert second_folder_resp.status_code == 201
        entry_gallery_id = entry_folder_resp.json()["id"]
        first_folder_id = first_folder_resp.json()["id"]
        second_folder_id = second_folder_resp.json()["id"]

        reorder_resp = authenticated_client.put(
            f"/projects/{project_id}/galleries/reorder",
            json={"gallery_ids": [second_folder_id, entry_gallery_id, first_folder_id]},
        )
        assert reorder_resp.status_code == 204

        detail_resp = authenticated_client.get(f"/projects/{project_id}")
        assert detail_resp.status_code == 200
        reordered_galleries = detail_resp.json()["galleries"]
        assert [gallery["id"] for gallery in reordered_galleries] == [
            second_folder_id,
            entry_gallery_id,
            first_folder_id,
        ]
        assert [gallery["project_position"] for gallery in reordered_galleries] == [0, 1, 2]

        invalid_reorder_resp = authenticated_client.put(
            f"/projects/{project_id}/galleries/reorder",
            json={"gallery_ids": [second_folder_id, entry_gallery_id]},
        )
        assert invalid_reorder_resp.status_code == 400

    def test_project_share_cover_and_folder_order_follow_project_positions(self, authenticated_client: TestClient):
        project_resp = authenticated_client.post("/projects", json={"name": "Ordered Project"})
        assert project_resp.status_code == 201
        project_payload = project_resp.json()
        project_id = project_payload["id"]

        first_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "First", "project_visibility": "listed"},
        )
        second_folder_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Second", "project_visibility": "listed"},
        )
        assert first_folder_resp.status_code == 201
        assert second_folder_resp.status_code == 201
        first_folder_id = first_folder_resp.json()["id"]
        second_folder_id = second_folder_resp.json()["id"]

        first_photo_id = upload_photo_via_presigned(
            authenticated_client,
            first_folder_id,
            b"first",
            "first.jpg",
        )
        second_photo_id = upload_photo_via_presigned(
            authenticated_client,
            second_folder_id,
            b"second",
            "second.jpg",
        )

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        initial_public_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert initial_public_resp.status_code == 200
        initial_payload = initial_public_resp.json()
        assert initial_payload["scope_type"] == "project"
        assert initial_payload["project_name"] == "Ordered Project"
        assert [folder["folder_id"] for folder in initial_payload["folders"]] == [
            first_folder_id,
            second_folder_id,
        ]
        assert initial_payload["cover"]["photo_id"] == first_photo_id
        assert initial_payload["folders"][0]["route_path"] == f"/share/{project_share_id}/galleries/{first_folder_id}"

        move_second_left_resp = authenticated_client.patch(
            f"/galleries/{second_folder_id}",
            json={"project_position": 0},
        )
        move_first_right_resp = authenticated_client.patch(
            f"/galleries/{first_folder_id}",
            json={"project_position": 1},
        )
        assert move_second_left_resp.status_code == 200
        assert move_first_right_resp.status_code == 200

        detail_resp = authenticated_client.get(f"/projects/{project_id}")
        assert detail_resp.status_code == 200
        assert [gallery["id"] for gallery in detail_resp.json()["galleries"]] == [
            second_folder_id,
            first_folder_id,
        ]

        reordered_public_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert reordered_public_resp.status_code == 200
        reordered_payload = reordered_public_resp.json()
        assert reordered_payload["scope_type"] == "project"
        assert reordered_payload["project_name"] == "Ordered Project"
        assert [folder["folder_id"] for folder in reordered_payload["folders"]] == [
            second_folder_id,
            first_folder_id,
        ]
        assert reordered_payload["cover"]["photo_id"] == second_photo_id
        assert reordered_payload["folders"][0]["route_path"] == f"/share/{project_share_id}/galleries/{second_folder_id}"
