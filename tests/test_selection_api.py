from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from tests.helpers import upload_photo_via_presigned
from viewport.repositories.selection_repository import SelectionRepository

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
        assert isinstance(alice_owner_payload["items"][0]["photo_thumbnail_url"], str)
        assert alice_owner_payload["items"][0]["photo_thumbnail_url"].startswith("http")
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

    def test_public_selection_submit_succeeds_when_notification_dispatch_fails(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        def _raise_notification_error(payload):
            raise RuntimeError("broker unavailable")

        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", _raise_notification_error)

        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert start_resp.status_code == 200
        resume_token = start_resp.json()["resume_token"]

        toggle_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}?resume_token={resume_token}")
        assert toggle_resp.status_code == 200

        submit_resp = authenticated_client.post(f"/s/{share_id}/selection/session/submit?resume_token={resume_token}")
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "submitted"
        assert submit_resp.json()["notification_enqueued"] is False

        detail_resp = authenticated_client.get(f"/s/{share_id}/selection/session/me?resume_token={resume_token}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["status"] == "submitted"

    def test_public_selection_start_always_creates_new_session_even_with_resume_cookie(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        first_start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert first_start_resp.status_code == 200
        first_session = first_start_resp.json()

        second_start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Bob Client"},
        )
        assert second_start_resp.status_code == 200
        second_session = second_start_resp.json()

        assert second_session["id"] != first_session["id"]
        assert second_session["resume_token"] != first_session["resume_token"]
        assert second_session["client_name"] == "Bob Client"

        detail_resp = authenticated_client.get(f"/share-links/{share_id}/selection")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["aggregate"]["total_sessions"] == 2

    def test_public_selection_query_resume_token_does_not_fixate_cookie(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert start_resp.status_code == 200
        resume_token = start_resp.json()["resume_token"]

        toggle_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}?resume_token={resume_token}")
        assert toggle_resp.status_code == 200

        authenticated_client.cookies.clear()

        restore_via_query = authenticated_client.get(f"/s/{share_id}/selection/session/me?resume_token={resume_token}")
        assert restore_via_query.status_code == 200
        assert "set-cookie" not in restore_via_query.headers

        restore_without_token = authenticated_client.get(f"/s/{share_id}/selection/session/me")
        assert restore_without_token.status_code == 404

    def test_reopen_all_gallery_selections_clears_submitted_at(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert start_resp.status_code == 200
        resume_token = start_resp.json()["resume_token"]

        toggle_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}?resume_token={resume_token}")
        assert toggle_resp.status_code == 200

        submit_resp = authenticated_client.post(f"/s/{share_id}/selection/session/submit?resume_token={resume_token}")
        assert submit_resp.status_code == 200
        submitted_session_id = start_resp.json()["id"]
        submitted_at = submit_resp.json()["submitted_at"]
        assert submitted_at is not None

        authenticated_client.cookies.clear()
        second_start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Bulk Flow Client"},
        )
        assert second_start_resp.status_code == 200
        second_session_id = second_start_resp.json()["id"]

        close_all_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/selections/actions/close-all")
        assert close_all_resp.status_code == 200
        assert close_all_resp.json()["affected_count"] == 1

        open_all_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/selections/actions/open-all")
        assert open_all_resp.status_code == 200
        assert open_all_resp.json()["affected_count"] == 1

        submitted_detail = authenticated_client.get(f"/share-links/{share_id}/selection/sessions/{submitted_session_id}")
        assert submitted_detail.status_code == 200
        assert submitted_detail.json()["status"] == "submitted"
        assert submitted_detail.json()["submitted_at"] == submitted_at

        reopened_detail = authenticated_client.get(f"/share-links/{share_id}/selection/sessions/{second_session_id}")
        assert reopened_detail.status_code == 200
        assert reopened_detail.json()["status"] == "in_progress"
        assert reopened_detail.json()["submitted_at"] is None

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

    def test_public_selection_cookie_backed_requests_and_validation_errors(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("viewport.api.selection.notify_selection_submitted_task.delay", lambda payload: None)

        photo_id = upload_photo_via_presigned(authenticated_client, gallery_id_fixture, b"first", "first.jpg")
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        strict_config_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={
                "is_enabled": True,
                "require_email": True,
                "require_phone": True,
                "require_client_note": True,
            },
        )
        assert strict_config_resp.status_code == 200

        missing_email_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert missing_email_resp.status_code == 422
        assert missing_email_resp.json()["detail"] == "client_email is required"

        config_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={
                "is_enabled": True,
                "allow_photo_comments": False,
                "require_email": False,
                "require_phone": False,
                "require_client_note": False,
            },
        )
        assert config_resp.status_code == 200

        start_resp = authenticated_client.post(
            f"/s/{share_id}/selection/session",
            json={"client_name": "Alice Client"},
        )
        assert start_resp.status_code == 200
        session_id = start_resp.json()["id"]

        me_resp = authenticated_client.get(f"/s/{share_id}/selection/session/me")
        assert me_resp.status_code == 200
        assert "set-cookie" in me_resp.headers

        invalid_photo_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{uuid4()}")
        assert invalid_photo_resp.status_code == 404
        assert invalid_photo_resp.json()["detail"] == "Photo not found for this share link"

        select_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}")
        assert select_resp.status_code == 200
        assert select_resp.json()["selected"] is True
        assert "set-cookie" in select_resp.headers

        deselect_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}")
        assert deselect_resp.status_code == 200
        assert deselect_resp.json()["selected"] is False

        comment_disabled_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{photo_id}",
            json={"comment": "Should fail"},
        )
        assert comment_disabled_resp.status_code == 403
        assert comment_disabled_resp.json()["detail"] == "Photo comments are disabled"

        enable_comments_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"allow_photo_comments": True, "require_client_note": True},
        )
        assert enable_comments_resp.status_code == 200

        invalid_photo_comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{uuid4()}",
            json={"comment": "Missing photo"},
        )
        assert invalid_photo_comment_resp.status_code == 404
        assert invalid_photo_comment_resp.json()["detail"] == "Photo not found for this share link"

        unselected_comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{photo_id}",
            json={"comment": "Still not selected"},
        )
        assert unselected_comment_resp.status_code == 404
        assert unselected_comment_resp.json()["detail"] == "Photo is not selected"

        reselect_resp = authenticated_client.put(f"/s/{share_id}/selection/session/items/{photo_id}")
        assert reselect_resp.status_code == 200
        assert reselect_resp.json()["selected"] is True

        comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{photo_id}",
            json={"comment": "Needs retouch"},
        )
        assert comment_resp.status_code == 200
        assert comment_resp.json()["comment"] == "Needs retouch"
        assert "set-cookie" in comment_resp.headers

        missing_comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{photo_id}",
            json={},
        )
        assert missing_comment_resp.status_code == 422
        assert missing_comment_resp.json()["detail"] == "comment is required"

        me_after_missing_comment_resp = authenticated_client.get(f"/s/{share_id}/selection/session/me")
        assert me_after_missing_comment_resp.status_code == 200
        assert me_after_missing_comment_resp.json()["items"][0]["comment"] == "Needs retouch"

        clear_comment_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session/items/{photo_id}",
            json={"comment": ""},
        )
        assert clear_comment_resp.status_code == 200
        assert clear_comment_resp.json()["comment"] is None

        me_after_clear_resp = authenticated_client.get(f"/s/{share_id}/selection/session/me")
        assert me_after_clear_resp.status_code == 200
        assert me_after_clear_resp.json()["items"][0]["comment"] is None

        empty_note_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session",
            json={"client_note": "   "},
        )
        assert empty_note_resp.status_code == 422
        assert empty_note_resp.json()["detail"] == "client_note is required"

        note_resp = authenticated_client.patch(
            f"/s/{share_id}/selection/session",
            json={"client_note": "Ready to submit"},
        )
        assert note_resp.status_code == 200
        assert note_resp.json()["client_note"] == "Ready to submit"
        assert "set-cookie" in note_resp.headers

        close_resp = authenticated_client.post(f"/share-links/{share_id}/selection/sessions/{session_id}/close")
        assert close_resp.status_code == 200

        submit_resp = authenticated_client.post(f"/s/{share_id}/selection/session/submit")
        assert submit_resp.status_code == 409
        assert submit_resp.json()["detail"] == "Selection is closed by photographer"

    def test_owner_selection_config_validation_and_integrity_error_branches(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        fake_share_id = uuid4()

        missing_config_resp = authenticated_client.get(f"/galleries/{gallery_id_fixture}/share-links/{fake_share_id}/selection-config")
        assert missing_config_resp.status_code == 404
        assert missing_config_resp.json()["detail"] == "Share link not found"

        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)

        owner_config_resp = authenticated_client.get(f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config")
        assert owner_config_resp.status_code == 200
        assert owner_config_resp.json()["is_enabled"] is False

        update_missing_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{fake_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert update_missing_resp.status_code == 404
        assert update_missing_resp.json()["detail"] == "Share link not found"

        missing_limit_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"limit_enabled": True},
        )
        assert missing_limit_resp.status_code == 422
        assert missing_limit_resp.json()["detail"] == "limit_value is required when limit_enabled is true"

        disabled_limit_with_value_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"limit_enabled": False, "limit_value": 1},
        )
        assert disabled_limit_with_value_resp.status_code == 422
        assert "limit_value must not be set when limit_enabled is false" in str(disabled_limit_with_value_resp.json()["detail"])

        async def _raise_integrity_error(*args, **kwargs):
            raise IntegrityError("update", {}, Exception("constraint violation"))

        monkeypatch.setattr(SelectionRepository, "update_config", _raise_integrity_error)
        integrity_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert integrity_resp.status_code == 422
        assert integrity_resp.json()["detail"] == "Invalid selection configuration"

    def test_owner_selection_missing_resource_endpoints_return_404(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        share_id = _create_sharelink(authenticated_client, gallery_id_fixture)
        enable_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert enable_resp.status_code == 200

        fake_share_id = uuid4()
        fake_session_id = uuid4()
        fake_gallery_id = uuid4()

        owner_detail_missing_resp = authenticated_client.get(f"/share-links/{fake_share_id}/selection")
        assert owner_detail_missing_resp.status_code == 404
        assert owner_detail_missing_resp.json()["detail"] == "Share link not found"

        close_missing_share_resp = authenticated_client.post(f"/share-links/{fake_share_id}/selection/close")
        assert close_missing_share_resp.status_code == 404
        assert close_missing_share_resp.json()["detail"] == "Share link not found"

        reopen_missing_share_resp = authenticated_client.post(f"/share-links/{fake_share_id}/selection/reopen")
        assert reopen_missing_share_resp.status_code == 404
        assert reopen_missing_share_resp.json()["detail"] == "Share link not found"

        close_no_sessions_resp = authenticated_client.post(f"/share-links/{share_id}/selection/close")
        assert close_no_sessions_resp.status_code == 404
        assert close_no_sessions_resp.json()["detail"] == "Selection session not found"

        reopen_no_sessions_resp = authenticated_client.post(f"/share-links/{share_id}/selection/reopen")
        assert reopen_no_sessions_resp.status_code == 404
        assert reopen_no_sessions_resp.json()["detail"] == "Selection session not found"

        owner_session_detail_missing_resp = authenticated_client.get(f"/share-links/{share_id}/selection/sessions/{fake_session_id}")
        assert owner_session_detail_missing_resp.status_code == 404
        assert owner_session_detail_missing_resp.json()["detail"] == "Selection session not found"

        close_missing_session_resp = authenticated_client.post(f"/share-links/{share_id}/selection/sessions/{fake_session_id}/close")
        assert close_missing_session_resp.status_code == 404
        assert close_missing_session_resp.json()["detail"] == "Selection session not found"

        reopen_missing_session_resp = authenticated_client.post(f"/share-links/{share_id}/selection/sessions/{fake_session_id}/reopen")
        assert reopen_missing_session_resp.status_code == 404
        assert reopen_missing_session_resp.json()["detail"] == "Selection session not found"

        gallery_rows_missing_resp = authenticated_client.get(f"/galleries/{fake_gallery_id}/selections")
        assert gallery_rows_missing_resp.status_code == 404
        assert gallery_rows_missing_resp.json()["detail"] == "Gallery not found"

        close_all_missing_resp = authenticated_client.post(f"/galleries/{fake_gallery_id}/selections/actions/close-all")
        assert close_all_missing_resp.status_code == 404
        assert close_all_missing_resp.json()["detail"] == "Gallery not found"

        reopen_all_missing_resp = authenticated_client.post(f"/galleries/{fake_gallery_id}/selections/actions/open-all")
        assert reopen_all_missing_resp.status_code == 404
        assert reopen_all_missing_resp.json()["detail"] == "Gallery not found"

        files_export_missing_resp = authenticated_client.get(f"/share-links/{fake_share_id}/selection/export/files.csv")
        assert files_export_missing_resp.status_code == 404
        assert files_export_missing_resp.json()["detail"] == "Share link not found"

        lightroom_export_missing_resp = authenticated_client.get(f"/share-links/{fake_share_id}/selection/export/lightroom.txt")
        assert lightroom_export_missing_resp.status_code == 404
        assert lightroom_export_missing_resp.json()["detail"] == "Share link not found"

        summary_export_missing_resp = authenticated_client.get(f"/galleries/{fake_gallery_id}/selections/export/summary.csv")
        assert summary_export_missing_resp.status_code == 404
        assert summary_export_missing_resp.json()["detail"] == "Gallery not found"

        links_export_missing_resp = authenticated_client.get(f"/galleries/{fake_gallery_id}/selections/export/links.csv")
        assert links_export_missing_resp.status_code == 404
        assert links_export_missing_resp.json()["detail"] == "Gallery not found"

    def test_owner_project_and_sharelink_selection_config_aliases_cover_project_routes(
        self,
        authenticated_client: TestClient,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Selection Config Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        share_resp = authenticated_client.post(
            f"/projects/{project_id}/share-links",
            json={"label": "Project selection"},
        )
        assert share_resp.status_code == 201
        share_id = share_resp.json()["id"]

        project_config_resp = authenticated_client.get(
            f"/projects/{project_id}/share-links/{share_id}/selection-config",
        )
        assert project_config_resp.status_code == 200
        assert project_config_resp.json()["is_enabled"] is False

        sharelink_config_resp = authenticated_client.get(f"/share-links/{share_id}/selection-config")
        assert sharelink_config_resp.status_code == 200
        assert sharelink_config_resp.json()["is_enabled"] is False

        project_update_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{share_id}/selection-config",
            json={"is_enabled": True, "allow_photo_comments": True},
        )
        assert project_update_resp.status_code == 200
        assert project_update_resp.json()["is_enabled"] is True
        assert project_update_resp.json()["allow_photo_comments"] is True

        sharelink_update_resp = authenticated_client.patch(
            f"/share-links/{share_id}/selection-config",
            json={"list_title": "Proof favorites"},
        )
        assert sharelink_update_resp.status_code == 200
        assert sharelink_update_resp.json()["list_title"] == "Proof favorites"

        fake_share_id = uuid4()
        missing_project_get_resp = authenticated_client.get(
            f"/projects/{project_id}/share-links/{fake_share_id}/selection-config",
        )
        assert missing_project_get_resp.status_code == 404
        assert missing_project_get_resp.json()["detail"] == "Share link not found"

        missing_sharelink_get_resp = authenticated_client.get(f"/share-links/{fake_share_id}/selection-config")
        assert missing_sharelink_get_resp.status_code == 404
        assert missing_sharelink_get_resp.json()["detail"] == "Share link not found"

        missing_project_update_resp = authenticated_client.patch(
            f"/projects/{project_id}/share-links/{fake_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert missing_project_update_resp.status_code == 404
        assert missing_project_update_resp.json()["detail"] == "Share link not found"

        missing_sharelink_update_resp = authenticated_client.patch(
            f"/share-links/{fake_share_id}/selection-config",
            json={"is_enabled": True},
        )
        assert missing_sharelink_update_resp.status_code == 404
        assert missing_sharelink_update_resp.json()["detail"] == "Share link not found"
