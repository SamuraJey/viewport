import io
import zipfile


class TestPublicZipDownload:
    def test_download_all_photos_zip_success(self, client, sharelink_data, auth_headers):
        share_id, gallery_id = sharelink_data

        # Upload two photos as the gallery owner (default test user)
        for i in range(2):
            file_content = f"test image data {i}".encode()
            files = {"file": (f"test{i}.jpg", file_content, "image/jpeg")}
            client.post(f"/galleries/{gallery_id}/photos", files=files, headers=auth_headers)

        # Download ZIP (no auth needed for public endpoint)
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

    def test_download_all_photos_zip_empty(self, client, sharelink_data):
        share_id, gallery_id = sharelink_data
        # No photos uploaded
        resp = client.get(f"/s/{share_id}/download/all")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "No photos found"
