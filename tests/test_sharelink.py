from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.app.main import app
from src.app.models.sharelink import ShareLink


@pytest.fixture(scope="function")
def client(setup_db):
    return TestClient(app)


class TestShareLinkModel:
    def test_sharelink_fields(self, client, setup_db):
        # Проверяем, что все поля создаются корректно
        gallery_id = uuid4()
        expires = datetime.utcnow() + timedelta(days=1)
        share = ShareLink(id=uuid4(), gallery_id=gallery_id, expires_at=expires, views=5, zip_downloads=2, single_downloads=1, created_at=datetime.utcnow())
        assert share.gallery_id == gallery_id
        assert share.expires_at == expires
        assert share.views == 5
        assert share.zip_downloads == 2
        assert share.single_downloads == 1

    def test_sharelink_nullable_expires(self, client, setup_db):
        # expires_at может быть None
        share = ShareLink(id=uuid4(), gallery_id=uuid4(), expires_at=None, views=0, zip_downloads=0, single_downloads=0, created_at=datetime.utcnow())
        assert share.expires_at is None
