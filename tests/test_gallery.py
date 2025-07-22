import pytest
from fastapi.testclient import TestClient

from src.app.main import app


@pytest.fixture(scope="function")
def client(setup_db):
    return TestClient(app)


class TestGalleryAPI:
    def register_and_login(self, client, email, password):
        reg_payload = {"email": email, "password": password}
        client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        return token

    def test_create_gallery(self, client):
        token = self.register_and_login(client, "galleryuser@example.com", "gallerypass123")
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/galleries", json={}, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert "owner_id" in data
        assert "created_at" in data

    def test_create_gallery_unauth(self, client):
        resp = client.post("/galleries", json={})
        assert resp.status_code == 403 or resp.status_code == 401

    def test_list_galleries(self, client):
        token = self.register_and_login(client, "listuser@example.com", "listpass123")
        headers = {"Authorization": f"Bearer {token}"}
        # Create 3 galleries
        for _ in range(3):
            client.post("/galleries", json={}, headers=headers)
        resp = client.get("/galleries", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "galleries" in data
        assert data["total"] == 3
        assert len(data["galleries"]) == 3

    def test_list_galleries_pagination(self, client):
        token = self.register_and_login(client, "pageuser@example.com", "pagepass123")
        headers = {"Authorization": f"Bearer {token}"}
        for _ in range(15):
            client.post("/galleries", json={}, headers=headers)
        resp = client.get("/galleries?page=2&size=10", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert data["size"] == 10
        assert len(data["galleries"]) == 5

    def test_list_galleries_unauth(self, client):
        resp = client.get("/galleries")
        assert resp.status_code == 403 or resp.status_code == 401
