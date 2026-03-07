import io
from typing import cast

import requests
from fastapi.testclient import TestClient
from PIL import Image


def create_valid_jpeg_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), "orange").save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    return buffer.read()


def _ensure_valid_image_bytes(content: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(content)) as img:
            img.verify()
        return content
    except Exception:
        return create_valid_jpeg_bytes()


def register_and_login(client: TestClient, email: str, password: str, invite_code: str) -> str:
    """Register a user and return their access token."""
    reg_payload = {"email": email, "password": password, "invite_code": invite_code}
    reg_response = client.post("/auth/register", json=reg_payload)
    assert reg_response.status_code == 201

    login_response = client.post("/auth/login", json=reg_payload)
    assert login_response.status_code == 200
    return cast(str, login_response.json()["tokens"]["access_token"])


def upload_photo_via_presigned(client: TestClient, gallery_id: str, content: bytes, filename: str = "photo.jpg") -> str:
    """Upload a photo using the presigned upload flow and return its ID."""
    image_content = _ensure_valid_image_bytes(content)
    files_payload = [
        {
            "filename": filename,
            "file_size": len(image_content),
            "content_type": "image/jpeg",
        }
    ]

    resp = client.post(f"/galleries/{gallery_id}/photos/batch-presigned", json={"files": files_payload})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("items"), "Expected presigned items in response"
    item = data["items"][0]

    presigned_url = item["presigned_data"]["url"]
    headers = item["presigned_data"]["headers"]
    upload_resp = requests.put(presigned_url, headers=headers, data=image_content)
    assert upload_resp.status_code in {200, 204}

    confirm_resp = client.post(
        f"/galleries/{gallery_id}/photos/batch-confirm",
        json={"items": [{"photo_id": item["photo_id"], "success": True}]},
    )
    assert confirm_resp.status_code == 200

    return item["photo_id"]
