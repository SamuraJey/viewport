import io
import zipfile
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response
from fastapi.testclient import TestClient

from tests.helpers import upload_photo_via_presigned
from viewport.api.public import (
    _build_project_cover,
    _build_public_gallery_response,
    _build_public_project_response,
    _date_str,
    _ensure_gallery_share_scope,
    _require_gallery_share_id,
    download_all_photos_zip,
    get_photos_by_sharelink,
    get_public_photos_by_ids,
    get_valid_sharelink,
)
from viewport.models.sharelink import ShareScopeType
from viewport.zip_utils import build_zip_fallback_name, make_unique_zip_entry_name, sanitize_zip_entry_name

pytestmark = pytest.mark.requires_s3


def _upload_photo(client: TestClient, gallery_id: str, content: bytes, filename: str = "photo.jpg") -> str:
    return upload_photo_via_presigned(client, gallery_id, content, filename)


class TestPublicAPI:
    def test_date_str_returns_empty_string_when_all_candidates_missing(self):
        assert _date_str(None, None) == ""

    @pytest.mark.asyncio
    async def test_get_valid_sharelink_returns_404_when_missing(self):
        repo = MagicMock()
        repo.get_sharelink_for_public_access = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await get_valid_sharelink(uuid4(), repo=repo)

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "ShareLink not found"

    @pytest.mark.asyncio
    async def test_build_project_cover_returns_none_for_missing_gallery_and_invalid_cover_keys(self):
        gallery_repo = MagicMock()
        s3_client = MagicMock()

        assert await _build_project_cover(gallery=None, gallery_repo=gallery_repo, s3_client=s3_client) is None

        gallery = SimpleNamespace(id=uuid4(), cover_photo_id=uuid4())
        gallery_repo.get_photo_by_id_and_gallery = AsyncMock(
            return_value=SimpleNamespace(object_key=None, thumbnail_object_key=None),
        )

        assert await _build_project_cover(gallery=gallery, gallery_repo=gallery_repo, s3_client=s3_client) is None

    @pytest.mark.asyncio
    async def test_build_public_gallery_response_includes_cover_metadata(self):
        share_id = uuid4()
        photo_id = uuid4()
        photo = SimpleNamespace(
            id=photo_id,
            thumbnail_object_key="thumb-key",
            object_key="full-key",
            display_name="hero.jpg",
            width=1200,
            height=800,
        )
        gallery = SimpleNamespace(
            id=uuid4(),
            owner_id=uuid4(),
            owner=SimpleNamespace(display_name="Jane Doe"),
            project_id=None,
            cover_photo_id=photo_id,
            name="Proof",
            shooting_date=None,
            created_at=datetime(2026, 4, 19, 12, 0, 0),
            public_sort_by="original_filename",
            public_sort_order="asc",
        )
        sharelink = SimpleNamespace(created_at=datetime(2026, 4, 19, 12, 30, 0), project=None)
        repo = MagicMock()
        repo.get_photo_count_by_gallery = AsyncMock(return_value=1)
        repo.get_photos_by_gallery_id = AsyncMock(return_value=[photo])
        repo.record_view = AsyncMock()
        repo.db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: photo))
        s3_client = MagicMock()
        s3_client.generate_presigned_urls_batch = AsyncMock(return_value={"thumb-key": "https://example.com/thumb"})
        s3_client.generate_presigned_urls_batch_for_dispositions = AsyncMock(return_value={})
        s3_client.generate_presigned_url_async = AsyncMock(return_value="https://example.com/full")
        request = SimpleNamespace(base_url="https://example.com/", client=None, headers={})
        response = Response()

        payload = await _build_public_gallery_response(
            share_id=share_id,
            request=request,
            response=response,
            repo=repo,
            s3_client=s3_client,
            sharelink=sharelink,
            gallery=gallery,
            limit=None,
            offset=0,
        )

        assert payload.cover is not None
        assert payload.cover.photo_id == str(photo_id)
        assert payload.cover.filename == "hero.jpg"
        assert payload.site_url == "https://example.com"
        repo.record_view.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_build_public_gallery_response_handles_missing_cover_photo_record(self):
        gallery = SimpleNamespace(
            id=uuid4(),
            owner_id=uuid4(),
            owner=SimpleNamespace(display_name="Jane Doe"),
            project_id=None,
            cover_photo_id=uuid4(),
            name="Proof",
            shooting_date=None,
            created_at=datetime(2026, 4, 19, 12, 0, 0),
            public_sort_by="original_filename",
            public_sort_order="asc",
        )
        sharelink = SimpleNamespace(created_at=datetime(2026, 4, 19, 12, 30, 0), project=None)
        photo = SimpleNamespace(
            id=uuid4(),
            thumbnail_object_key="thumb-key",
            object_key="full-key",
            display_name="hero.jpg",
            width=1200,
            height=800,
        )
        repo = MagicMock()
        repo.get_photo_count_by_gallery = AsyncMock(return_value=1)
        repo.get_photos_by_gallery_id = AsyncMock(return_value=[photo])
        repo.record_view = AsyncMock()
        repo.db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None))
        s3_client = MagicMock()
        s3_client.generate_presigned_urls_batch = AsyncMock(return_value={"thumb-key": "https://example.com/thumb"})
        s3_client.generate_presigned_urls_batch_for_dispositions = AsyncMock(return_value={})
        request = SimpleNamespace(base_url="https://example.com/", client=None, headers={})

        payload = await _build_public_gallery_response(
            share_id=uuid4(),
            request=request,
            response=Response(),
            repo=repo,
            s3_client=s3_client,
            sharelink=sharelink,
            gallery=gallery,
            limit=None,
            offset=0,
        )

        assert payload.cover is None

    @pytest.mark.asyncio
    async def test_build_public_project_response_rejects_missing_project(self):
        with pytest.raises(HTTPException) as exc_info:
            await _build_public_project_response(
                share_id=uuid4(),
                request=SimpleNamespace(client=None, headers={}, base_url="https://example.com/"),
                response=Response(),
                project_repo=MagicMock(),
                gallery_repo=MagicMock(),
                s3_client=MagicMock(),
                sharelink=SimpleNamespace(project=None),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"

    def test_gallery_scope_helpers_reject_wrong_sharelink_shapes(self):
        with pytest.raises(HTTPException) as scope_exc:
            _ensure_gallery_share_scope(SimpleNamespace(scope_type=ShareScopeType.PROJECT.value))
        assert scope_exc.value.status_code == 404
        assert scope_exc.value.detail == "Gallery share not found"

        with pytest.raises(HTTPException) as missing_gallery_exc:
            _require_gallery_share_id(
                SimpleNamespace(scope_type=ShareScopeType.GALLERY.value, gallery_id=None),
            )
        assert missing_gallery_exc.value.status_code == 404
        assert missing_gallery_exc.value.detail == "Gallery not found"

    @pytest.mark.asyncio
    async def test_get_photos_by_sharelink_rejects_gallery_share_without_gallery(self):
        with pytest.raises(HTTPException) as exc_info:
            await get_photos_by_sharelink(
                share_id=uuid4(),
                request=SimpleNamespace(client=None, headers={}, base_url="https://example.com/"),
                response=Response(),
                repo=MagicMock(),
                gallery_repo=MagicMock(),
                project_repo=MagicMock(),
                sharelink=SimpleNamespace(scope_type=ShareScopeType.GALLERY.value, gallery=None),
                s3_client=MagicMock(),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Gallery not found"

    @pytest.mark.asyncio
    async def test_get_public_photos_by_ids_rejects_project_share_without_project_id(self):
        with pytest.raises(HTTPException) as exc_info:
            await get_public_photos_by_ids(
                share_id=uuid4(),
                response=Response(),
                photo_ids=[uuid4()],
                repo=MagicMock(),
                sharelink=SimpleNamespace(scope_type=ShareScopeType.PROJECT.value, project_id=None),
                s3_client=MagicMock(),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"

    def test_download_all_photos_zip_rejects_project_share_without_project_id(self):
        with pytest.raises(HTTPException) as exc_info:
            download_all_photos_zip(
                share_id=uuid4(),
                repo=MagicMock(),
                project_repo=MagicMock(),
                sharelink=SimpleNamespace(scope_type=ShareScopeType.PROJECT.value, project_id=None),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"

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

    def test_public_gallery_includes_cover_metadata_when_cover_photo_is_set(
        self,
        authenticated_client: TestClient,
        gallery_id_fixture: str,
    ):
        photo_id = _upload_photo(authenticated_client, gallery_id_fixture, b"cover", "cover.jpg")
        set_cover_resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/cover/{photo_id}")
        assert set_cover_resp.status_code == 200

        share_resp = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/share-links",
            json={"gallery_id": gallery_id_fixture, "expires_at": "2099-01-01T00:00:00Z"},
        )
        assert share_resp.status_code == 201

        public_resp = authenticated_client.get(f"/s/{share_resp.json()['id']}")
        assert public_resp.status_code == 200
        assert public_resp.json()["cover"]["photo_id"] == photo_id
        assert public_resp.json()["cover"]["filename"] == "cover.jpg"

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
        assert sanitize_zip_entry_name(raw_name, fallback=fallback) == expected

    def test_sanitize_zip_entry_name_truncates_long_names(self):
        long_name = f"{'я' * 400}.jpeg"
        sanitized = sanitize_zip_entry_name(long_name, fallback="fallback.jpg")

        assert sanitized.endswith(".jpeg")
        assert len(sanitized.encode("utf-8")) <= 255

    def test_make_unique_zip_entry_name_is_case_insensitive(self):
        used: set[str] = set()
        first = make_unique_zip_entry_name("A.jpg", used)
        second = make_unique_zip_entry_name("a.jpg", used)
        third = make_unique_zip_entry_name("a.jpg", used)

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
        assert build_zip_fallback_name(raw_name, object_key, fallback_stem) == expected

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

    def test_project_share_lists_cover_thumbnails_and_nested_route_rejects_gallery_share(
        self,
        authenticated_client: TestClient,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Public Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]
        folder_id = project_resp.json()["entry_gallery_id"]

        photo_id = _upload_photo(authenticated_client, folder_id, b"delivery", "delivery.jpg")
        cover_resp = authenticated_client.post(f"/galleries/{folder_id}/cover/{photo_id}")
        assert cover_resp.status_code == 200

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

        root_resp = authenticated_client.get(f"/s/{project_share_id}")
        assert root_resp.status_code == 200
        payload = root_resp.json()
        assert payload["folders"][0]["cover_thumbnail_url"].startswith("http")

        gallery_share_resp = authenticated_client.post(f"/galleries/{folder_id}/share-links", json={})
        assert gallery_share_resp.status_code == 201
        nested_on_gallery_share = authenticated_client.get(
            f"/s/{gallery_share_resp.json()['id']}/galleries/{folder_id}",
        )
        assert nested_on_gallery_share.status_code == 404
        assert nested_on_gallery_share.json()["detail"] == "Project share not found"

    def test_public_photos_by_ids_supports_gallery_and_project_download_all_zip(
        self,
        authenticated_client: TestClient,
    ):
        gallery_resp = authenticated_client.post("/galleries", json={"name": "Gallery Proof"})
        assert gallery_resp.status_code == 201
        gallery_id = gallery_resp.json()["id"]
        gallery_photo_id = _upload_photo(authenticated_client, gallery_id, b"gallery", "gallery.jpg")

        gallery_share_resp = authenticated_client.post(f"/galleries/{gallery_id}/share-links", json={})
        assert gallery_share_resp.status_code == 201
        gallery_share_id = gallery_share_resp.json()["id"]

        gallery_photos_resp = authenticated_client.get(
            f"/s/{gallery_share_id}/photos/by-ids",
            params=[("photo_ids", gallery_photo_id)],
        )
        assert gallery_photos_resp.status_code == 200
        assert [photo["filename"] for photo in gallery_photos_resp.json()] == ["gallery.jpg"]

        missing_gallery_photos_resp = authenticated_client.get(
            f"/s/{gallery_share_id}/photos/by-ids",
            params=[("photo_ids", str(uuid4()))],
        )
        assert missing_gallery_photos_resp.status_code == 200
        assert missing_gallery_photos_resp.json() == []

        project_resp = authenticated_client.post("/projects", json={"name": "Zip Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]
        listed_gallery_id = project_resp.json()["entry_gallery_id"]

        second_gallery_resp = authenticated_client.post(
            f"/projects/{project_id}/galleries",
            json={"name": "Sneak Peeks", "project_visibility": "listed"},
        )
        assert second_gallery_resp.status_code == 201
        second_gallery_id = second_gallery_resp.json()["id"]

        _upload_photo(authenticated_client, listed_gallery_id, b"one", "first.jpg")
        _upload_photo(authenticated_client, second_gallery_id, b"two", "second.jpg")

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201
        project_share_id = project_share_resp.json()["id"]

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

            project_zip_resp = authenticated_client.get(f"/s/{project_share_id}/download/all")

        assert project_zip_resp.status_code == 200
        assert project_zip_resp.headers["content-disposition"].startswith(
            f'attachment; filename="project_{project_share_id}.zip"',
        )

        with zipfile.ZipFile(io.BytesIO(project_zip_resp.content)) as archive:
            names = archive.namelist()

        assert any(name.startswith("Zip Project - ") for name in names)
        assert any(name.startswith("Sneak Peeks - ") for name in names)

    def test_project_download_all_returns_404_when_visible_project_has_no_photos(
        self,
        authenticated_client: TestClient,
    ):
        project_resp = authenticated_client.post("/projects", json={"name": "Empty Zip Project"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        project_share_resp = authenticated_client.post(f"/projects/{project_id}/share-links", json={})
        assert project_share_resp.status_code == 201

        download_resp = authenticated_client.get(f"/s/{project_share_resp.json()['id']}/download/all")
        assert download_resp.status_code == 404
