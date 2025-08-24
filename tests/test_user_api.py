from fastapi.testclient import TestClient


def test_get_me_unauthenticated(client: TestClient):
    response = client.get("/me")
    assert response.status_code == 401


def test_update_display_name_success(authenticated_client: TestClient):
    # Get initial profile
    me_resp = authenticated_client.get("/me")
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data.get("display_name") is None

    # Update display_name
    payload = {"display_name": "New Name"}
    update_resp = authenticated_client.put("/me", json=payload)
    assert update_resp.status_code == 200
    upd_data = update_resp.json()
    assert upd_data["display_name"] == "New Name"

    # Verify via GET
    me_resp2 = authenticated_client.get("/me")
    assert me_resp2.status_code == 200
    assert me_resp2.json()["display_name"] == "New Name"


def test_update_display_name_unauthenticated(client: TestClient):
    payload = {"display_name": "Name"}
    resp = client.put("/me", json=payload)
    assert resp.status_code == 401


def test_change_password_success(authenticated_client: TestClient, test_user_data):
    # Change password
    payload = {"current_password": test_user_data["password"], "new_password": "newpass123", "confirm_password": "newpass123"}
    resp = authenticated_client.put("/me/password", json=payload)
    assert resp.status_code == 200
    assert "Password updated" in resp.json().get("message", "")

    # Logout and try login with new password
    # Clear header
    authenticated_client.headers.pop("Authorization", None)
    login_resp = authenticated_client.post("/auth/login", json={"email": test_user_data["email"], "password": "newpass123"})
    assert login_resp.status_code == 200


def test_change_password_mismatch(authenticated_client: TestClient):
    payload = {"current_password": "whatever", "new_password": "abc12345", "confirm_password": "different"}
    resp = authenticated_client.put("/me/password", json=payload)
    assert resp.status_code == 400
    assert "do not match" in resp.json().get("detail", "").lower()


def test_change_password_wrong_current(authenticated_client: TestClient):
    payload = {"current_password": "wrongpass", "new_password": "another123", "confirm_password": "another123"}
    resp = authenticated_client.put("/me/password", json=payload)
    assert resp.status_code == 400
    assert "incorrect" in resp.json().get("detail", "").lower()


def test_change_password_unauthenticated(client: TestClient):
    payload = {"current_password": "any", "new_password": "abc12345", "confirm_password": "abc12345"}
    resp = client.put("/me/password", json=payload)
    assert resp.status_code == 401
