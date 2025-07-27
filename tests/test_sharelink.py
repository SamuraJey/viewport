from datetime import UTC, datetime, timedelta
from uuid import uuid4

from src.viewport.models.sharelink import ShareLink


class TestShareLinkModel:
    def test_sharelink_fields(self, client, setup_db):
        # Проверяем, что все поля создаются корректно
        gallery_id = uuid4()
        expires = datetime.now(UTC) + timedelta(days=1)
        share = ShareLink(id=uuid4(), gallery_id=gallery_id, expires_at=expires, views=5, zip_downloads=2, single_downloads=1, created_at=datetime.now(UTC))
        assert share.gallery_id == gallery_id
        assert share.expires_at == expires
        assert share.views == 5
        assert share.zip_downloads == 2
        assert share.single_downloads == 1

    def test_sharelink_nullable_expires(self, client, setup_db):
        # expires_at может быть None
        share = ShareLink(id=uuid4(), gallery_id=uuid4(), expires_at=None, views=0, zip_downloads=0, single_downloads=0, created_at=datetime.now(UTC))
        assert share.expires_at is None
