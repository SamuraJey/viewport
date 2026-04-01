from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.helpers import upload_photo_via_presigned

pytestmark = pytest.mark.requires_s3


def _create_sharelink(authenticated_client: TestClient, gallery_id: str) -> str:
    expires_at = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    response = authenticated_client.post(
        f"/galleries/{gallery_id}/share-links",
        json={"expires_at": expires_at},
    )
    assert response.status_code == 201
    return response.json()["id"]


class TestSelectionAPI:
    def test_public_selection_supports_multiple_independent_sessions(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second", "second.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True, "allow_photo_comments": True},
        )
        assert enable_resp.status_code == 200

        start_alice = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice", "client_email": "alice@example.com"},
        )
        assert start_alice.status_code == 200
        alice_payload = start_alice.json()
        alice_token = alice_payload["resume_token"]
        alice_session_id = alice_payload["id"]

        # Different browser/client gets an independent session on the same share link.
        authenticated_client.cookies.clear()
        start_bob = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Bob", "client_email": "bob@example.com"},
        )
        assert start_bob.status_code == 200
        bob_payload = start_bob.json()
        bob_token = bob_payload["resume_token"]
        bob_session_id = bob_payload["id"]
        assert bob_session_id != alice_session_id
        assert bob_token != alice_token

        # Same client + cookie resumes existing session instead of creating another one.
        resume_bob = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Bob", "client_email": "bob@example.com"},
        )
        assert resume_bob.status_code == 200
        assert resume_bob.json()["id"] == bob_session_id

        alice_toggle = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={alice_token}")
        assert alice_toggle.status_code == 200
        assert alice_toggle.json()["selected"] is True

        alice_comment = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={alice_token}",
            json={"comment": "Alice pick"},
        )
        assert alice_comment.status_code == 200

        bob_toggle = authenticated_client.put(f"/s/{share_id}/selection/session/items/{second_photo_id}?resume_token={bob_token}")
        assert bob_toggle.status_code == 200
        assert bob_toggle.json()["selected"] is True

        alice_me = authenticated_client.get(f"/s/{share_id}/selection/session/me?resume_token={alice_token}")
        bob_me = authenticated_client.get(f"/s/{share_id}/selection/session/me?resume_token={bob_token}")
        assert alice_me.status_code == 200
        assert bob_me.status_code == 200
        assert alice_me.json()["selected_count"] == 1
        assert bob_me.json()["selected_count"] == 1
        assert alice_me.json()["items"][0]["photo_id"] == first_photo_id
        assert bob_me.json()["items"][0]["photo_id"] == second_photo_id

        owner_detail = authenticated_client.get(f"/share-links/{share_id}/selection")
        assert owner_detail.status_code == 200
        detail_payload = owner_detail.json()
        assert detail_payload["aggregate"]["total_sessions"] == 2
        assert detail_payload["aggregate"]["selected_count"] == 2
        assert len(detail_payload["sessions"]) == 2

        alice_owner_detail = authenticated_client.get(f"/share-links/{share_id}/selection/sessions/{alice_session_id}")
        assert alice_owner_detail.status_code == 200
        alice_owner_payload = alice_owner_detail.json()
        assert alice_owner_payload["client_name"] == "Alice"
        assert alice_owner_payload["items"][0]["photo_id"] == first_photo_id
        assert alice_owner_payload["items"][0]["photo_display_name"] == "first.jpg"
        assert alice_owner_payload["items"][0]["comment"] == "Alice pick"

    def test_public_selection_session_lifecycle(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second", "second.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        config_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={
                "is_enabled": True,
                "limit_enabled": True,
                "limit_value": 1,
                "allow_photo_comments": True,
                "require_client_note": False,
            },
        )
        assert config_resp.status_code == 200
        assert config_resp.json()["is_enabled"] is True

        public_config = authenticated_client.get(f"/s/{share_id}/selection/config")
        assert public_config.status_code == 200
        assert public_config.json()["limit_value"] == 1

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client", "client_email": "alice@example.com"},
        )
        assert start_resp.status_code == 200
        session_payload = start_resp.json()
        resume_token = session_payload["resume_token"]
        assert isinstance(resume_token, str) and resume_token

        me_resp = authenticated_client.get(f"/s/{share_id}/selection/session/me?resume_token={resume_token}")
        assert me_resp.status_code == 200
        assert me_resp.json()["client_name"] == "Alice Client"

        toggle_first = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={resume_token}")
        assert toggle_first.status_code == 200
        assert toggle_first.json()["selected"] is True
        assert toggle_first.json()["selected_count"] == 1

        toggle_second = authenticated_client.put(f"/s/{share_id}/selection/session/items/{second_photo_id}?resume_token={resume_token}")
        assert toggle_second.status_code == 409
        assert "limit reached" in toggle_second.json()["detail"].lower()

        comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={resume_token}",
            json={"comment": "Retouch skin tone"},
        )
        assert comment_resp.status_code == 200
        assert comment_resp.json()["comment"] == "Retouch skin tone"

        note_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session?resume_token={resume_token}",
            json={"client_note": "Please prioritize this one"},
        )
        assert note_resp.status_code == 200
        assert note_resp.json()["client_note"] == "Please prioritize this one"

        submit_resp = authenticated_client.post(f"/s/{share_id}/selection/session/submit?resume_token={resume_token}")
        assert submit_resp.status_code == 200
        submit_payload = submit_resp.json()
        assert submit_payload["status"] == "submitted"
        assert submit_payload["selected_count"] == 1
        assert submit_payload["notification_enqueued"] is True

        toggle_after_submit = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={resume_token}")
        assert toggle_after_submit.status_code == 409
        assert "already submitted" in toggle_after_submit.json()["detail"].lower()

        idempotent_submit = authenticated_client.post(f"/s/{share_id}/selection/session/submit?resume_token={resume_token}")
        assert idempotent_submit.status_code == 200
        assert idempotent_submit.json()["notification_enqueued"] is False

    def test_public_selection_returns_404_for_inactive_and_410_for_expired(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        inactive_share_id = _create_sharelink(authenticated_client, gallery_id_fixture)
        disable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{inactive_share_id}",
            json={"is_active": False},
        )
        assert disable_resp.status_code == 200

        inactive_resp = authenticated_client.get(f"/s/{inactive_share_id}/selection/config")
        assert inactive_resp.status_code == 404

        expired_resp_create = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat()},
        )
        assert expired_resp_create.status_code == 201
        expired_share_id = expired_resp_create.json()["id"]

        expired_resp = authenticated_client.get(f"/s/{expired_share_id}/selection/config")
        assert expired_resp.status_code == 410

    def test_owner_selection_views_actions_and_exports(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        first_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        second_photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"second", "second.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True, "allow_photo_comments": True},
        )
        assert enable_resp.status_code == 200

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Owner Flow Client A"},
        )
        assert start_resp.status_code == 200
        session_a = start_resp.json()
        token_a = session_a["resume_token"]
        session_a_id = session_a["id"]

        authenticated_client.cookies.clear()
        start_second_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Owner Flow Client B"},
        )
        assert start_second_resp.status_code == 200
        session_b = start_second_resp.json()
        token_b = session_b["resume_token"]
        session_b_id = session_b["id"]

        toggle_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={token_a}")
        assert toggle_resp.status_code == 200

        toggle_second_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{second_photo_id}?resume_token={token_b}")
        assert toggle_second_resp.status_code == 200

        submit_resp = authenticated_client.post(f"/s/{share_id}/selection/session/submit?resume_token={token_a}")
        assert submit_resp.status_code == 200

        detail_resp = authenticated_client.get(f"/share-links/{share_id}/selection")
        assert detail_resp.status_code == 200
        detail_payload = detail_resp.json()
        assert detail_payload["sharelink_id"] == share_id
        assert detail_payload["aggregate"]["total_sessions"] == 2
        assert detail_payload["aggregate"]["submitted_sessions"] == 1
        assert detail_payload["aggregate"]["in_progress_sessions"] == 1
        assert detail_payload["aggregate"]["selected_count"] == 2
        assert len(detail_payload["sessions"]) == 2
        assert detail_payload["session"]["status"] == "submitted"
        assert detail_payload["session"]["id"] == session_a_id
        assert detail_payload["session"]["selected_count"] == 1

        close_session_b = authenticated_client.post(f"/share-links/{share_id}/selection/sessions/{session_b_id}/close")
        assert close_session_b.status_code == 200
        assert close_session_b.json()["status"] == "closed"

        toggle_closed_session = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={token_b}")
        assert toggle_closed_session.status_code == 409
        assert "closed" in toggle_closed_session.json()["detail"].lower()

        reopen_session_b = authenticated_client.post(f"/share-links/{share_id}/selection/sessions/{session_b_id}/reopen")
        assert reopen_session_b.status_code == 200
        assert reopen_session_b.json()["status"] == "in_progress"

        toggle_after_reopen = authenticated_client.put(f"/s/{share_id}/selection/session/items/{first_photo_id}?resume_token={token_b}")
        assert toggle_after_reopen.status_code == 200

        close_resp = authenticated_client.post(f"/share-links/{share_id}/selection/close?session_id={session_a_id}")
        assert close_resp.status_code == 200
        assert close_resp.json()["status"] == "closed"

        reopen_resp = authenticated_client.post(f"/share-links/{share_id}/selection/reopen?session_id={session_a_id}")
        assert reopen_resp.status_code == 200
        assert reopen_resp.json()["status"] == "in_progress"

        gallery_rows = authenticated_client.get(f"/galleries/{gallery_id_fixture}/selections")
        assert gallery_rows.status_code == 200
        assert len(gallery_rows.json()) >= 1
        row = gallery_rows.json()[0]
        assert row["sharelink_id"] == share_id
        assert row["session_count"] == 2
        assert row["selected_count"] >= 2

        close_all_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/selections/actions/close-all")
        assert close_all_resp.status_code == 200
        assert close_all_resp.json()["affected_count"] >= 2

        open_all_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/selections/actions/open-all")
        assert open_all_resp.status_code == 200
        assert open_all_resp.json()["affected_count"] >= 2

        files_csv = authenticated_client.get(f"/share-links/{share_id}/selection/export/files.csv")
        assert files_csv.status_code == 200
        assert "filename,comment" in files_csv.text
        assert "first.jpg" in files_csv.text

        lightroom_txt = authenticated_client.get(f"/share-links/{share_id}/selection/export/lightroom.txt")
        assert lightroom_txt.status_code == 200
        assert "first.jpg" in lightroom_txt.text

        summary_csv = authenticated_client.get(f"/galleries/{gallery_id_fixture}/selections/export/summary.csv")
        assert summary_csv.status_code == 200
        assert "sharelink_id,label,selection_status,selected_count" in summary_csv.text
        assert share_id in summary_csv.text

        links_csv = authenticated_client.get(f"/galleries/{gallery_id_fixture}/selections/export/links.csv")
        assert links_csv.status_code == 200
        assert "sharelink_id,label,public_url,selection_status,selected_count,updated_at" in links_csv.text
        assert f"/share/{share_id}" in links_csv.text
