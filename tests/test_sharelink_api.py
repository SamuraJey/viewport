from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from src.app.main import app


@pytest.fixture(scope="function")
def client(setup_db):
    return TestClient(app)


class TestShareLinkAPI:
    def setup_gallery(self, client):
        reg_payload = {"email": "share@example.com", "password": "sharepass123"}
        client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        gallery_resp = client.post("/galleries", json={}, headers=headers)
        gallery_id = gallery_resp.json()["id"]
        return headers, gallery_id

    def test_create_sharelink_success(self, client):
        headers, gallery_id = self.setup_gallery(client)
        expires = (datetime.utcnow() + timedelta(days=1)).isoformat()
        payload = {"gallery_id": gallery_id, "expires_at": expires}
        resp = client.post(f"/galleries/{gallery_id}/share-links", json=payload, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["gallery_id"] == gallery_id
        assert data["expires_at"] == expires or data["expires_at"] is not None
        assert data["views"] == 0
        assert data["zip_downloads"] == 0
        assert data["single_downloads"] == 0

    def test_create_sharelink_wrong_gallery(self, client):
        headers, gallery_id = self.setup_gallery(client)
        fake_gallery_id = "00000000-0000-0000-0000-000000000000"
        payload = {"gallery_id": fake_gallery_id, "expires_at": None}
        resp = client.post(f"/galleries/{fake_gallery_id}/share-links", json=payload, headers=headers)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Gallery not found"
