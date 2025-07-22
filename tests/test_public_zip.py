import io
import zipfile
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from src.app.main import app


@pytest.fixture(scope="function")
def client(setup_db):
    return TestClient(app)


class TestPublicZipDownload:
    def setup_sharelink(self, client):
        reg_payload = {"email": "ziptest@example.com", "password": "ziptestpass123"}
        client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        gallery_resp = client.post("/galleries", json={}, headers=headers)
        gallery_id = gallery_resp.json()["id"]
        expires = (datetime.utcnow() + timedelta(days=1)).isoformat()
        share_payload = {"gallery_id": gallery_id, "expires_at": expires}
        share_resp = client.post(f"/galleries/{gallery_id}/share-links", json=share_payload, headers=headers)
        share_id = share_resp.json()["id"]
        return share_id, gallery_id, headers

    def test_download_all_photos_zip_success(self, client):
        share_id, gallery_id, headers = self.setup_sharelink(client)
        # Upload two photos
        for i in range(2):
            file_content = f"test image data {i}".encode()
            files = {"file": (f"test{i}.jpg", file_content, "image/jpeg")}
            client.post(f"/galleries/{gallery_id}/photos", files=files, headers=headers)
        # Download ZIP
        resp = client.get(f"/s/{share_id}/download/all")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        zip_bytes = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_bytes, "r") as zipf:
            names = zipf.namelist()
            assert any("test0.jpg" in n for n in names)
            assert any("test1.jpg" in n for n in names)
            for name in names:
                with zipf.open(name) as f:
                    data = f.read()
                    assert data.startswith(b"test image data")

    def test_download_all_photos_zip_empty(self, client):
        share_id, gallery_id, headers = self.setup_sharelink(client)
        # No photos uploaded
        resp = client.get(f"/s/{share_id}/download/all")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "No photos found"
