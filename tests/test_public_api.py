import io
import zipfile
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.helpers import upload_photo_via_presigned
from viewport.api.public import _build_zip_fallback_name, _make_unique_zip_entry_name, _sanitize_zip_entry_name


def _upload_photo(client: TestClient, gallery_id: str, content: bytes, filename: str = "photo.jpg") -> str:
    return upload_photo_via_presigned(client, gallery_id, content, filename)


class TestPublicAPI:
    def test_get_photos_by_sharelink_returns_410_for_expired_link(self, authenticated_client: TestClient, gallery_id_fixture: str):
        expired_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"expires_at": expired_at},
        )
        assert resp.status_code == 201
        share_id = resp.json()["id"]

        public_resp = authenticated_client.get(f"/s/{share_id}")
        assert public_resp.status_code == 410
        assert public_resp.headers.get("Cache-Control") == "no-store, max-age=0, must-revalidate"
        assert public_resp.headers.get("Pragma") == "no-cache"
        assert public_resp.headers.get("Expires") == "0"

    def test_get_photos_by_sharelink_returns_404_for_inactive_link(self, authenticated_client: TestClient, gallery_id_fixture: str):
        create_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"expires_at": "2099-01-01T00:00:00Z"},
        )
        assert create_resp.status_code == 201
        share_id = create_resp.json()["id"]

        patch_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/share-links/{share_id}",
            json={"is_active": False},
        )
        assert patch_resp.status_code == 200

        public_resp = authenticated_client.get(f"/s/{share_id}")
        assert public_resp.status_code == 404
        assert public_resp.headers.get("Cache-Control") == "no-store, max-age=0, must-revalidate"

    def test_get_photos_by_sharelink_uses_saved_gallery_sort_settings(self, authenticated_client: TestClient, gallery_id_fixture: str):
        _upload_photo(authenticated_client, gallery_id_fixture, b"one", "a.jpg")
        _upload_photo(authenticated_client, gallery_id_fixture, b"two", "b.jpg")

        resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"},
        )
        assert resp.status_code == 201
        share_id = resp.json()["id"]

        asc_resp = authenticated_client.get(f"/s/{share_id}")
        assert asc_resp.status_code == 200
        asc_names = [photo["filename"] for photo in asc_resp.json()["photos"]]
        assert asc_names == ["a.jpg", "b.jpg"]

        patch_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}",
            json={"public_sort_by": "original_filename", "public_sort_order": "desc"},
        )
        assert patch_resp.status_code == 200

        desc_resp = authenticated_client.get(f"/s/{share_id}")
        assert desc_resp.status_code == 200
        desc_names = [photo["filename"] for photo in desc_resp.json()["photos"]]
        assert desc_names == ["b.jpg", "a.jpg"]

    def test_get_photos_by_sharelink_and_urls(self, authenticated_client: TestClient, gallery_id_fixture: str):
        # Upload two photos
        _p1 = _upload_photo(authenticated_client, gallery_id_fixture, b"one", "a.jpg")
        _p2 = _upload_photo(authenticated_client, gallery_id_fixture, b"two", "b.jpg")

        # Create sharelink for gallery
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"})
        assert resp.status_code == 201
        share_id = resp.json()["id"]

        # Public gallery listing - now includes presigned URLs directly
        public_resp = authenticated_client.get(f"/s/{share_id}")
        assert public_resp.status_code == 200
        assert public_resp.headers.get("Cache-Control") == "no-store, max-age=0, must-revalidate"
        data = public_resp.json()
        assert "photos" in data
        assert isinstance(data["photos"], list)
        assert len(data["photos"]) == 2

        # Check filenames are present
        names = [p["filename"] for p in data["photos"]]
        assert any("a.jpg" in n or "b.jpg" in n for n in names)

        # Check that presigned URLs are included in the response
        for photo in data["photos"]:
            assert "full_url" in photo
            assert "thumbnail_url" in photo
            assert isinstance(photo["full_url"], str)
            assert isinstance(photo["thumbnail_url"], str)
            assert photo["full_url"].startswith("http")
            assert photo["thumbnail_url"].startswith("http")
            # presigned urls generated by boto3 include X-Amz-Algorithm or X-Amz-Signature
            assert ("X-Amz-Algorithm" in photo["full_url"] or "X-Amz-Signature" in photo["full_url"]) or photo["full_url"].startswith("http://localhost")
            assert ("X-Amz-Algorithm" in photo["thumbnail_url"] or "X-Amz-Signature" in photo["thumbnail_url"]) or photo["thumbnail_url"].startswith("http://localhost")

    def test_public_gallery_uses_shooting_date(self, authenticated_client: TestClient, gallery_id_fixture: str):
        # Set shooting date
        resp = authenticated_client.patch(f"/galleries/{gallery_id_fixture}", json={"shooting_date": "2024-06-10"})
        assert resp.status_code == 200

        # Create sharelink for gallery
        share_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"})
        assert share_resp.status_code == 201
        share_id = share_resp.json()["id"]

        public_resp = authenticated_client.get(f"/s/{share_id}")
        assert public_resp.status_code == 200
        data = public_resp.json()
        assert data.get("date") == "10.06.2024"

    def test_stream_photo_and_downloads(self, authenticated_client: TestClient, gallery_id_fixture: str):
        # Upload photo and create sharelink
        content = b"streamcontent"
        _photo_id = _upload_photo(authenticated_client, gallery_id_fixture, content, "stream.jpg")
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"})
        share_id = resp.json()["id"]

        # Mock s3 client and settings for zip download
        fake_bucket = "test-bucket"
        fake_obj = {"Body": io.BytesIO(content), "ContentType": "image/jpeg"}

        with patch("viewport.s3_utils.get_s3_client") as mock_settings_class, patch("viewport.api.public.get_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_settings_class.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.return_value = fake_obj
            mock_get_s3.return_value = mock_client

            # Download all as zip
            dl_all = authenticated_client.get(f"/s/{share_id}/download/all")
            assert dl_all.status_code == 200
            assert dl_all.headers.get("Content-Type") == "application/zip"

    def test_download_all_404_when_no_photos(self, authenticated_client: TestClient, gallery_id_fixture: str):
        # Create sharelink for empty gallery
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"})
        share_id = resp.json()["id"]

        # Remove photos from gallery by attempting download on a new empty gallery
        r = authenticated_client.get(f"/s/{share_id}/download/all")
        # Should be 404 because no photos
        assert r.status_code == 404

    def test_download_all_zip_sanitizes_path_like_display_name(self, authenticated_client: TestClient, gallery_id_fixture: str):
        content = b"zip-safe-content"
        photo_id = _upload_photo(authenticated_client, gallery_id_fixture, content, "safe.jpg")

        rename_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename",
            json={"filename": "../...jpg"},
        )
        assert rename_resp.status_code == 200

        share_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"},
        )
        assert share_resp.status_code == 201
        share_id = share_resp.json()["id"]

        fake_bucket = "test-bucket"
        fake_obj = {"Body": io.BytesIO(content), "ContentType": "image/jpeg"}

        with patch("viewport.api.public.get_s3_settings") as mock_get_settings, patch("viewport.api.public.get_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.return_value = fake_obj
            mock_get_s3.return_value = mock_client

            response = authenticated_client.get(f"/s/{share_id}/download/all")
            assert response.status_code == 200

        zip_bytes = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_bytes) as archive:
            names = archive.namelist()

        assert len(names) == 1
        assert names[0] == f"photo-{photo_id}.jpg"
        assert "/" not in names[0]
        assert "\\" not in names[0]

    @pytest.mark.parametrize(
        ("raw_name", "fallback", "expected"),
        [
            ("image.jpg", "fallback.jpg", "image.jpg"),
            ("jpg", "fallback.jpg", "fallback.jpg"),
            ("PNG", "fallback.jpg", "fallback.jpg"),
            ("  spaced   name   .jpg  ", "fallback.jpg", "spaced name .jpg"),
            ("bad?.jpg", "fallback.jpg", "bad_.jpg"),
            ("\x00evil.jpg", "fallback.jpg", "evil.jpg"),
            ("safe\u202egpj.exe", "fallback.jpg", "safegpj.exe"),
            ("...hidden...", "fallback.jpg", "hidden"),
            ("", "fallback.jpg", "fallback.jpg"),
            ("   ", "fallback.jpg", "fallback.jpg"),
            (".", "fallback.jpg", "fallback.jpg"),
            ("..", "fallback.jpg", "fallback.jpg"),
            ("../escape.jpg", "fallback.jpg", "fallback.jpg"),
            ("..\\escape.jpg", "fallback.jpg", "fallback.jpg"),
            ("/abs/path.jpg", "fallback.jpg", "fallback.jpg"),
            ("C:evil.jpg", "fallback.jpg", "fallback.jpg"),
            ("C:\\temp\\a.jpg", "fallback.jpg", "fallback.jpg"),
            ("\\\\server\\share\\a.jpg", "fallback.jpg", "fallback.jpg"),
            ("CON.txt", "fallback.jpg", "fallback.jpg"),
            ("CoM1.log", "fallback.jpg", "fallback.jpg"),
            ("nul", "fallback.jpg", "fallback.jpg"),
            ("safe.jpg:payload.exe", "fallback.jpg", "safe.jpg_payload.exe"),
            ("／etc／passwd", "fallback.jpg", "fallback.jpg"),
            ("\u2215etc\u2215passwd", "fallback.jpg", "fallback.jpg"),
        ],
    )
    def test_sanitize_zip_entry_name_attack_matrix(self, raw_name: str, fallback: str, expected: str):
        assert _sanitize_zip_entry_name(raw_name, fallback=fallback) == expected

    def test_sanitize_zip_entry_name_truncates_long_names(self):
        long_name = f"{'я' * 400}.jpeg"
        sanitized = _sanitize_zip_entry_name(long_name, fallback="fallback.jpg")

        assert sanitized.endswith(".jpeg")
        assert len(sanitized.encode("utf-8")) <= 255

    def test_make_unique_zip_entry_name_is_case_insensitive(self):
        used: set[str] = set()
        first = _make_unique_zip_entry_name("A.jpg", used)
        second = _make_unique_zip_entry_name("a.jpg", used)
        third = _make_unique_zip_entry_name("a.jpg", used)

        assert first == "A.jpg"
        assert second == "a (1).jpg"
        assert third == "a (2).jpg"

    @pytest.mark.parametrize(
        ("raw_name", "object_key", "fallback_stem", "expected"),
        [
            ("../name.png", "g/id.jpg", "photo-1", "photo-1.png"),
            ("C:\\temp\\name.jpg", "g/id.jpg", "photo-2", "photo-2.jpg"),
            ("reserved.CON", "g/id.png", "photo-3", "photo-3.png"),
            ("noext", "g/id.jpg", "photo-4", "photo-4.jpg"),
        ],
    )
    def test_build_zip_fallback_name_uses_allowed_extensions(self, raw_name: str, object_key: str, fallback_stem: str, expected: str):
        assert _build_zip_fallback_name(raw_name, object_key, fallback_stem) == expected

    def test_download_all_zip_preserves_png_extension_in_fallback(self, authenticated_client: TestClient, gallery_id_fixture: str):
        content = b"zip-safe-content"
        photo_id = _upload_photo(authenticated_client, gallery_id_fixture, content, "safe.png")

        rename_resp = authenticated_client.patch(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}/rename",
            json={"filename": "../...png"},
        )
        assert rename_resp.status_code == 200

        share_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"},
        )
        assert share_resp.status_code == 201
        share_id = share_resp.json()["id"]

        fake_bucket = "test-bucket"
        fake_obj = {"Body": io.BytesIO(content), "ContentType": "image/png"}

        with patch("viewport.api.public.get_s3_settings") as mock_get_settings, patch("viewport.api.public.get_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.return_value = fake_obj
            mock_get_s3.return_value = mock_client

            response = authenticated_client.get(f"/s/{share_id}/download/all")
            assert response.status_code == 200

        zip_bytes = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_bytes) as archive:
            names = archive.namelist()

        assert len(names) == 1
        assert names[0] == f"photo-{photo_id}.png"

    def test_download_all_zip_avoids_case_insensitive_filename_collisions(self, authenticated_client: TestClient, gallery_id_fixture: str):
        _upload_photo(authenticated_client, gallery_id_fixture, b"one", "A.jpg")
        _upload_photo(authenticated_client, gallery_id_fixture, b"two", "a.jpg")

        share_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"},
        )
        assert share_resp.status_code == 201
        share_id = share_resp.json()["id"]

        fake_bucket = "test-bucket"

        def _fake_get_object(*args, **kwargs):
            return {"Body": io.BytesIO(b"zip-content"), "ContentType": "image/jpeg"}

        with patch("viewport.api.public.get_s3_settings") as mock_get_settings, patch("viewport.api.public.get_s3_client") as mock_get_s3:
            mock_settings = MagicMock()
            mock_settings.bucket = fake_bucket
            mock_get_settings.return_value = mock_settings

            mock_client = MagicMock()
            mock_client.get_object.side_effect = _fake_get_object
            mock_get_s3.return_value = mock_client

            response = authenticated_client.get(f"/s/{share_id}/download/all")
            assert response.status_code == 200

        zip_bytes = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_bytes) as archive:
            names = archive.namelist()

        assert len(names) == 2
        assert len({name.casefold() for name in names}) == 2
