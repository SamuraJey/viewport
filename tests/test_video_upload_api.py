"""Tests for video upload API endpoints: batch-presigned, multipart complete/abort, batch-confirm rejection."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _video_file(filename: str = "sample.mp4", file_size: int = 50 * 1024 * 1024) -> dict:
    return {
        "filename": filename,
        "file_size": file_size,
        "content_type": "video/mp4",
    }


def _image_file(filename: str = "photo.jpg", file_size: int = 1024 * 1024) -> dict:
    return {
        "filename": filename,
        "file_size": file_size,
        "content_type": "image/jpeg",
    }


def _storage_snapshot(sync_engine, email: str) -> tuple[int, int]:
    with sync_engine.connect() as connection:
        row = connection.execute(
            text("SELECT storage_used, storage_reserved FROM users WHERE email = :email"),
            {"email": email},
        ).one()
    return int(row.storage_used), int(row.storage_reserved)


def _make_mock_s3_client(
    upload_id: str = "mock-upload-id",
    part_urls: list[str] | None = None,
    presigned_put: dict | None = None,
) -> MagicMock:
    """Create a mock AsyncS3Client with sensible defaults for video + image presigned ops."""
    mock = MagicMock()

    mock.create_multipart_upload = AsyncMock(return_value=upload_id)
    if part_urls is None:
        part_urls = [f"https://s3.example.com/part/{i}" for i in range(4)]
    mock.generate_presigned_upload_parts = AsyncMock(return_value=part_urls)

    if presigned_put is None:
        presigned_put = {"url": "https://s3.example.com/put/photo.jpg", "headers": {}}
    mock.generate_presigned_put = MagicMock(return_value=presigned_put)

    mock.complete_multipart_upload = AsyncMock()
    mock.abort_multipart_upload = AsyncMock()

    # Photo/gallery response building methods (async)
    mock.generate_presigned_url = AsyncMock(return_value="https://s3.example.com/dl/thumb.jpg")
    mock.generate_presigned_urls_batch = AsyncMock(return_value={"key": "https://s3.example.com/dl/key.jpg"})
    mock.generate_presigned_urls_batch_for_dispositions = AsyncMock(return_value={"key": "https://s3.example.com/dl/orig.jpg"})
    mock.generate_presigned_url_async = AsyncMock(return_value="https://s3.example.com/dl/async.jpg")

    return mock


# ---------------------------------------------------------------------------
# Fixture: gallery with mock S3
# ---------------------------------------------------------------------------


@pytest.fixture(scope="function")
def video_gallery(authenticated_client: TestClient) -> tuple[str, MagicMock]:
    """Create a gallery with mock S3 override active. Returns (gallery_id, mock_s3)."""
    from viewport.dependencies import get_s3_client

    mock_s3 = _make_mock_s3_client()

    async def _override():
        yield mock_s3

    authenticated_client.app.dependency_overrides[get_s3_client] = _override

    try:
        resp = authenticated_client.post("/galleries", json={})
        assert resp.status_code == 201, resp.text
        yield resp.json()["id"], mock_s3
    finally:
        authenticated_client.app.dependency_overrides.pop(get_s3_client, None)


# ---------------------------------------------------------------------------
# batch-presigned tests
# ---------------------------------------------------------------------------


class TestBatchPresignedVideo:
    def test_returns_multipart_for_video(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Posting a video returns upload_mode='multipart' with upload_id, part_size, and presigned_urls."""
        gallery_id, mock_s3 = video_gallery
        mock_s3.create_multipart_upload.return_value = "vid-up-1"
        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/part/1", "http://s3.example.com/part/2"])

        payload = {"files": [_video_file("clip.mp4", 32 * 1024 * 1024)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        items = data["items"]
        assert len(items) == 1
        item = items[0]
        assert item["success"] is True
        assert item["upload_mode"] == "multipart"
        assert item["upload_id"] == "vid-up-1"
        assert item["part_size"] == 16 * 1024 * 1024  # 16 MiB
        assert len(item["presigned_urls"]) == 2
        assert item["photo_id"] is not None

    def test_rejects_video_over_500mb(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Video > 500 MiB returns success=False with size error."""
        gallery_id, _ = video_gallery

        payload = {"files": [_video_file("huge.mp4", 501 * 1024 * 1024)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["success"] is False
        assert "exceeds" in items[0]["error"]

    def test_mixed_image_and_video(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Image goes single, video goes multipart in the same batch."""
        gallery_id, mock_s3 = video_gallery
        mock_s3.create_multipart_upload.return_value = "mix-upload"
        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/part/1"])
        payload = {
            "files": [
                _image_file("still.jpg", 2 * 1024 * 1024),
                _video_file("move.mp4", 16 * 1024 * 1024),
            ]
        }
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 2

        img = items[0]
        assert img["success"] is True
        assert img["upload_mode"] == "single"
        assert img["presigned_data"] is not None

        vid = items[1]
        assert vid["success"] is True
        assert vid["upload_mode"] == "multipart"
        assert vid["upload_id"] == "mix-upload"
        assert len(vid["presigned_urls"]) == 1


# ---------------------------------------------------------------------------
# multipart/complete tests
# ---------------------------------------------------------------------------


class TestMultipartComplete:
    def test_requires_owner_unauthenticated(self, client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Unauthenticated request returns 401."""
        gallery_id, _ = video_gallery
        pid = str(uuid4())

        # video_gallery fixture used authenticated_client which sets the
        # Authorization header on the shared client — strip it for this test.
        saved_auth = client.headers.pop("Authorization", None)
        try:
            resp = client.post(
                f"/galleries/{gallery_id}/photos/{pid}/multipart/complete",
                json={"upload_id": "x", "parts": []},
            )
            assert resp.status_code == 401, resp.text
        finally:
            if saved_auth is not None:
                client.headers["Authorization"] = saved_auth

    def test_requires_owner_foreign_gallery(self, authenticated_client: TestClient):
        """A gallery owned by another user returns 404."""
        pid = str(uuid4())
        other_gallery = str(uuid4())
        resp = authenticated_client.post(
            f"/galleries/{other_gallery}/photos/{pid}/multipart/complete",
            json={"upload_id": "x", "parts": []},
        )
        assert resp.status_code == 404

    def test_valid_finalizes_and_enqueues(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock], sync_engine, test_user_data: dict[str, str]):
        """Complete with valid ETags -> photo PROCESSING, multipart_upload_id NULL, quota finalized."""
        gallery_id, mock_s3 = video_gallery

        mock_s3.create_multipart_upload.return_value = "complete-up"
        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/p1", "http://s3.example.com/p2"])

        # Create the photo via batch-presigned (video)
        file_size = 32 * 1024 * 1024
        initial_used, initial_reserved = _storage_snapshot(sync_engine, test_user_data["email"])
        payload = {"files": [_video_file("final.mp4", file_size)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        assert _storage_snapshot(sync_engine, test_user_data["email"]) == (initial_used, initial_reserved + file_size)
        item = resp.json()["items"][0]
        photo_id = item["photo_id"]
        upload_id = item["upload_id"]

        # Complete multipart (mock process_videos_batch_task.delay)
        with patch("viewport.api.photo.process_videos_batch_task") as mock_task:
            mock_task.delay = MagicMock()
            complete_resp = authenticated_client.post(
                f"/galleries/{gallery_id}/photos/{photo_id}/multipart/complete",
                json={
                    "upload_id": upload_id,
                    "parts": [
                        {"ETag": '"etag1"', "PartNumber": 1},
                        {"ETag": '"etag2"', "PartNumber": 2},
                    ],
                },
            )
            assert complete_resp.status_code == 200, complete_resp.text
            data = complete_resp.json()
            assert data["confirmed_count"] == 1
            assert data["failed_count"] == 0
            mock_s3.complete_multipart_upload.assert_awaited_once()
            mock_task.delay.assert_called_once()

        assert _storage_snapshot(sync_engine, test_user_data["email"]) == (initial_used + file_size, initial_reserved)

        # Verify photo record is PROCESSING
        detail_resp = authenticated_client.get(f"/galleries/{gallery_id}")
        assert detail_resp.status_code == 200
        photos = detail_resp.json()["photos"]
        match = [p for p in photos if p["id"] == photo_id]
        assert len(match) == 1
        assert match[0]["status"] == "processing"

    def test_enqueue_failure_keeps_completed_upload_retryable(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """A post-commit enqueue failure leaves PROCESSING state that retries can re-enqueue."""
        gallery_id, mock_s3 = video_gallery
        response = authenticated_client.post(
            f"/galleries/{gallery_id}/photos/batch-presigned",
            json={"files": [_video_file("retry.mp4", 16 * 1024 * 1024)]},
        )
        item = response.json()["items"][0]
        complete_url = f"/galleries/{gallery_id}/photos/{item['photo_id']}/multipart/complete"
        body = {"upload_id": item["upload_id"], "parts": [{"ETag": '"etag"', "PartNumber": 1}]}

        with patch("viewport.api.photo.process_videos_batch_task") as mock_task:
            mock_task.delay.side_effect = RuntimeError("broker unavailable")
            failed = authenticated_client.post(complete_url, json=body)
            assert failed.status_code == 503, failed.text
            mock_s3.complete_multipart_upload.assert_awaited_once()

            detail = authenticated_client.get(f"/galleries/{gallery_id}")
            assert next(photo for photo in detail.json()["photos"] if photo["id"] == item["photo_id"])["status"] == "processing"

            mock_task.delay.side_effect = None
            retried = authenticated_client.post(complete_url, json=body)
            assert retried.status_code == 200, retried.text
            mock_task.delay.assert_called()

    def test_invalid_etag_returns_502_and_photo_stays_pending(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """When S3.complete_multipart_upload raises, return 502; photo remains PENDING."""
        gallery_id, mock_s3 = video_gallery

        mock_s3.complete_multipart_upload = AsyncMock(side_effect=Exception("ETag mismatch"))
        mock_s3.create_multipart_upload.return_value = "bad-etag-up"
        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/p1"])
        # Create photo
        payload = {"files": [_video_file("bad.mp4", 16 * 1024 * 1024)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        item = resp.json()["items"][0]
        photo_id = item["photo_id"]
        upload_id = item["upload_id"]

        # Complete with bad ETag
        complete_resp = authenticated_client.post(
            f"/galleries/{gallery_id}/photos/{photo_id}/multipart/complete",
            json={
                "upload_id": upload_id,
                "parts": [{"ETag": '"bad"', "PartNumber": 1}],
            },
        )
        assert complete_resp.status_code == 502, complete_resp.json()
        assert "Failed to complete multipart upload" in complete_resp.json()["detail"]

        # Photo still in pending state
        detail_resp = authenticated_client.get(f"/galleries/{gallery_id}")
        photos = detail_resp.json()["photos"]
        match = [p for p in photos if p["id"] == photo_id]
        assert len(match) == 1
        assert match[0]["status"] == "pending"


# ---------------------------------------------------------------------------
# multipart/abort tests
# ---------------------------------------------------------------------------


class TestMultipartAbort:
    def test_releases_quota_and_deletes_photo(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock], sync_engine, test_user_data: dict[str, str]):
        """Abort deletes the photo record and releases reserved storage."""
        gallery_id, mock_s3 = video_gallery

        mock_s3.create_multipart_upload.return_value = "abort-up"
        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/p1"])

        # Create photo (16 MB → 1 part)
        file_size = 16 * 1024 * 1024
        initial_storage = _storage_snapshot(sync_engine, test_user_data["email"])
        payload = {"files": [_video_file("forget.mp4", file_size)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        item = resp.json()["items"][0]
        photo_id = item["photo_id"]
        upload_id = item["upload_id"]
        assert _storage_snapshot(sync_engine, test_user_data["email"]) == (initial_storage[0], initial_storage[1] + file_size)

        # Abort
        abort_resp = authenticated_client.post(
            f"/galleries/{gallery_id}/photos/{photo_id}/multipart/abort",
            json={"upload_id": upload_id},
        )
        assert abort_resp.status_code == 200, abort_resp.json()
        mock_s3.abort_multipart_upload.assert_awaited_once()
        assert _storage_snapshot(sync_engine, test_user_data["email"]) == initial_storage

        # Photo is gone
        detail_resp = authenticated_client.get(f"/galleries/{gallery_id}")
        photos = detail_resp.json()["photos"]
        assert not any(p["id"] == photo_id for p in photos)

    def test_mismatched_upload_id_returns_400(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Abort with wrong upload_id returns 400 Upload ID mismatch."""
        gallery_id, mock_s3 = video_gallery

        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/p1"])

        payload = {"files": [_video_file("keep.mp4", 16 * 1024 * 1024)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        item = resp.json()["items"][0]
        photo_id = item["photo_id"]

        abort_resp = authenticated_client.post(
            f"/galleries/{gallery_id}/photos/{photo_id}/multipart/abort",
            json={"upload_id": "wrong-upload-id"},
        )
        assert abort_resp.status_code == 400
        assert "Upload ID mismatch" in abort_resp.json()["detail"]


# ---------------------------------------------------------------------------
# batch-confirm rejection of videos
# ---------------------------------------------------------------------------


class TestBatchConfirmRejectsVideos:
    def test_rejects_videos(self, authenticated_client: TestClient, video_gallery: tuple[str, MagicMock]):
        """Confirming a video via batch-confirm marks it FAILED and returns failed_count=1."""
        gallery_id, mock_s3 = video_gallery

        mock_s3.generate_presigned_upload_parts = AsyncMock(return_value=["http://s3.example.com/p1", "http://s3.example.com/p2"])

        # Create a video photo
        payload = {"files": [_video_file("nope.mp4", 32 * 1024 * 1024)]}
        resp = authenticated_client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json=payload)
        assert resp.status_code == 200, resp.text
        item = resp.json()["items"][0]
        photo_id = item["photo_id"]

        # Try to confirm via batch-confirm
        confirm_resp = authenticated_client.post(
            f"/galleries/{gallery_id}/photos/batch-confirm",
            json={"items": [{"photo_id": photo_id, "success": True}]},
        )
        assert confirm_resp.status_code == 200, confirm_resp.json()
        data = confirm_resp.json()
        assert data["confirmed_count"] == 0
        assert data["failed_count"] == 1

        # Video now has FAILED status
        detail_resp = authenticated_client.get(f"/galleries/{gallery_id}")
        photos = detail_resp.json()["photos"]
        match = [p for p in photos if p["id"] == photo_id]
        assert len(match) == 1
        assert match[0]["status"] == "failed"
