from typing import cast

from fastapi.testclient import TestClient


def register_and_login(client: TestClient, email: str, password: str) -> str:
    """Register a user and return their access token."""
    reg_payload = {"email": email, "password": password}
    reg_response = client.post("/auth/register", json=reg_payload)
    assert reg_response.status_code == 201

    login_response = client.post("/auth/login", json=reg_payload)
    assert login_response.status_code == 200
    return cast(str, login_response.json()["tokens"]["access_token"])
