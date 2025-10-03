"""Tests for database models."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import inspect

from src.viewport.models.gallery import Gallery, Photo
from src.viewport.models.sharelink import ShareLink
from src.viewport.models.user import User


@pytest.fixture
def user_fixture(db_session) -> User:
    user = User(email="photo@example.com", password_hash="hash")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def gallery_fixture(db_session, user_fixture: User) -> Gallery:
    gallery = Gallery(owner=user_fixture)
    db_session.add(gallery)
    db_session.commit()
    return gallery


@pytest.fixture
def photo_fixture(db_session, gallery_fixture: Gallery) -> Photo:
    photo = Photo(
        gallery=gallery_fixture,
        object_key="photos/test.jpg",
        thumbnail_object_key="photos/test.jpg",
        file_size=2048,
    )
    db_session.add(photo)
    db_session.commit()
    return photo


@pytest.fixture
def sharelink_fixture(db_session, gallery_fixture: Gallery) -> ShareLink:
    sharelink = ShareLink(gallery=gallery_fixture)
    db_session.add(sharelink)
    db_session.commit()
    return sharelink


class TestUserModel:
    """Test User model."""

    def test_user_creation(self, user_fixture: User):
        """Test creating a user (via fixture)."""
        user = user_fixture

        assert user.id is not None
        assert isinstance(user.id, uuid.UUID)
        assert user.email == "photo@example.com"
        assert user.password_hash == "hash"
        assert user.created_at is not None
        assert isinstance(user.created_at, datetime)

    def test_user_email_unique_constraint(self, db_session):
        """Test email unique constraint."""
        user1 = User(email="duplicate@example.com", password_hash="hash1")
        user2 = User(email="duplicate@example.com", password_hash="hash2")

        db_session.add(user1)
        db_session.commit()

        db_session.add(user2)
        with pytest.raises(Exception):  # noqa: B017
            db_session.commit()

    def test_user_id_auto_generated(self, db_session):
        """Test user ID is auto-generated."""
        user = User(email="auto@example.com", password_hash="hash")
        assert user.id is None  # Not set before adding to session

        db_session.add(user)
        db_session.flush()  # Flush to generate ID

        assert user.id is not None
        assert isinstance(user.id, uuid.UUID)

    def test_user_created_at_auto_generated(self, db_session):
        """Test created_at is auto-generated."""
        user = User(email="time@example.com", password_hash="hash")

        db_session.add(user)
        db_session.commit()

        assert isinstance(user.created_at, datetime)

    @pytest.mark.parametrize(
        "email,password_hash",
        [
            ("user1@test.com", "hash1"),
            ("user2@test.com", "hash2"),
            ("user3@test.com", "hash3"),
        ],
    )
    def test_user_multiple_instances(self, db_session, email, password_hash):
        """Test creating multiple users."""
        user = User(email=email, password_hash=password_hash)
        db_session.add(user)
        db_session.commit()

        assert user.email == email
        assert user.password_hash == password_hash

    def test_user_table_structure(self):
        """Test user table structure."""
        mapper = inspect(User)
        columns = [column.key for column in mapper.columns]

        expected_columns = ["id", "email", "password_hash", "created_at"]
        for col in expected_columns:
            assert col in columns

    def test_user_relationships(self, gallery_fixture: Gallery, user_fixture: User):
        """Test user relationships with galleries (via fixtures)."""
        gallery = gallery_fixture
        user = user_fixture

        # Test relationship
        assert gallery.owner == user
        assert gallery in user.galleries


class TestGalleryModel:
    """Test Gallery model."""

    def test_gallery_creation(self, gallery_fixture: Gallery, user_fixture: User):
        """Test creating a gallery (via fixture)."""
        gallery = gallery_fixture
        user = user_fixture

        assert gallery.id is not None
        assert isinstance(gallery.id, uuid.UUID)
        assert gallery.owner_id == user.id
        assert gallery.created_at is not None

    def test_gallery_owner_relationship(self, gallery_fixture: Gallery, user_fixture: User):
        """Test gallery-owner relationship (via fixtures)."""
        gallery = gallery_fixture
        user = user_fixture

        assert gallery.owner == user
        assert gallery.owner_id == user.id

    def test_gallery_cascade_delete_from_user(self, db_session):
        """Test gallery is deleted when user is deleted."""
        user = User(email="cascade@example.com", password_hash="hash")
        gallery = Gallery(owner=user)

        db_session.add(user)
        db_session.add(gallery)
        db_session.commit()

        gallery_id = gallery.id

        # Delete user
        db_session.delete(user)
        db_session.commit()

        # Gallery should be deleted too
        deleted_gallery = db_session.get(Gallery, gallery_id)
        assert deleted_gallery is None

    def test_gallery_photos_relationship(self, db_session, gallery_fixture: Gallery):
        """Test gallery-photos relationship using gallery fixture and a new photo."""
        gallery = gallery_fixture
        photo = Photo(gallery=gallery, object_key="test.jpg", thumbnail_object_key="test.jpg", file_size=1024)

        db_session.add(photo)
        db_session.commit()

        assert photo in gallery.photos
        assert photo.gallery == gallery

    def test_gallery_sharelinks_relationship(self, db_session, gallery_fixture: Gallery):
        """Test gallery-sharelinks relationship using gallery fixture and a new sharelink."""
        gallery = gallery_fixture
        sharelink = ShareLink(gallery=gallery)

        db_session.add(sharelink)
        db_session.commit()

        assert sharelink in gallery.share_links
        assert sharelink.gallery == gallery


class TestPhotoModel:
    """Test Photo model."""

    def test_photo_creation(self, photo_fixture: Photo, gallery_fixture: Gallery):
        """Test creating a photo (via fixture)."""
        photo = photo_fixture
        gallery = gallery_fixture

        assert photo.id is not None
        assert isinstance(photo.id, uuid.UUID)
        assert photo.gallery_id == gallery.id
        assert photo.object_key == "photos/test.jpg"
        assert photo.file_size == 2048
        assert photo.uploaded_at is not None

    @pytest.mark.parametrize(
        "object_key,file_size",
        [
            ("image1.jpg", 1024),
            ("folder/image2.png", 2048),
            ("deep/folder/image3.gif", 4096),
            ("测试图片.jpg", 1536),
        ],
    )
    def test_photo_different_keys_and_sizes(self, db_session, object_key, file_size):
        """Test photos with different object keys and sizes."""
        user = User(email="multi@example.com", password_hash="hash")
        gallery = Gallery(owner=user)
        photo = Photo(gallery=gallery, object_key=object_key, thumbnail_object_key=object_key, file_size=file_size)

        db_session.add(user)
        db_session.add(gallery)
        db_session.add(photo)
        db_session.commit()

        assert photo.object_key == object_key
        assert photo.file_size == file_size

    def test_photo_cascade_delete_from_gallery(self, db_session):
        """Test photo is deleted when gallery is deleted."""
        user = User(email="cascade2@example.com", password_hash="hash")
        gallery = Gallery(owner=user)
        photo = Photo(gallery=gallery, object_key="test.jpg", thumbnail_object_key="test.jpg", file_size=1024)

        db_session.add(user)
        db_session.add(gallery)
        db_session.add(photo)
        db_session.commit()

        photo_id = photo.id

        # Delete gallery
        db_session.delete(gallery)
        db_session.commit()

        # Photo should be deleted too
        deleted_photo = db_session.get(Photo, photo_id)
        assert deleted_photo is None

    def test_photo_uploaded_at_auto_generated(self, photo_fixture: Photo):
        """Test uploaded_at is set (via fixture)."""
        photo = photo_fixture
        assert isinstance(photo.uploaded_at, datetime)


class TestShareLinkModel:
    """Test ShareLink model."""

    def test_sharelink_creation(self, db_session, gallery_fixture: Gallery):
        """Test creating a share link with expiry using gallery fixture."""
        gallery = gallery_fixture
        expires_at = datetime.now(UTC) + timedelta(days=1)
        sharelink = ShareLink(gallery=gallery, expires_at=expires_at)

        db_session.add(sharelink)
        db_session.commit()

        assert sharelink.id is not None
        assert isinstance(sharelink.id, uuid.UUID)
        assert sharelink.gallery_id == gallery.id
        # Compare timezone-aware equality
        assert sharelink.expires_at.replace(tzinfo=UTC) == expires_at.replace(tzinfo=UTC)
        assert sharelink.views == 0
        assert sharelink.zip_downloads == 0
        assert sharelink.single_downloads == 0
        assert sharelink.created_at is not None

    def test_sharelink_without_expiry(self, sharelink_fixture: ShareLink):
        """Test creating a share link without expiry (via fixture)."""
        sharelink = sharelink_fixture
        assert sharelink.expires_at is None

    @pytest.mark.parametrize(
        "views,zip_downloads,single_downloads",
        [
            (0, 0, 0),
            (5, 2, 10),
            (100, 50, 200),
        ],
    )
    def test_sharelink_counters(self, db_session, gallery_fixture: Gallery, views, zip_downloads, single_downloads):
        """Test share link with different counter values."""
        gallery = gallery_fixture
        sharelink = ShareLink(gallery=gallery, views=views, zip_downloads=zip_downloads, single_downloads=single_downloads)

        db_session.add(sharelink)
        db_session.commit()

        assert sharelink.views == views
        assert sharelink.zip_downloads == zip_downloads
        assert sharelink.single_downloads == single_downloads

    def test_sharelink_gallery_relationship(self, sharelink_fixture: ShareLink, gallery_fixture: Gallery):
        """Test sharelink-gallery relationship (via fixtures)."""
        sharelink = sharelink_fixture
        gallery = gallery_fixture

        assert sharelink.gallery == gallery
        assert sharelink in gallery.share_links

    def test_sharelink_created_at_auto_generated(self, sharelink_fixture: ShareLink):
        """Test created_at is auto-generated (via fixture)."""
        sharelink = sharelink_fixture
        assert isinstance(sharelink.created_at, datetime)


class TestModelRelationships:
    """Test relationships between models."""

    def test_complete_model_relationships(self, db_session):
        """Test complete relationships between all models."""
        # Create a user
        user = User(email="complete@example.com", password_hash="hash")

        # Create a gallery owned by the user
        gallery = Gallery(owner=user)

        # Create photos in the gallery
        photo1 = Photo(gallery=gallery, object_key="photo1.jpg", thumbnail_object_key="photo1.jpg", file_size=1024)
        photo2 = Photo(gallery=gallery, object_key="photo2.jpg", thumbnail_object_key="photo2.jpg", file_size=2048)

        # Create share links for the gallery
        sharelink1 = ShareLink(gallery=gallery)
        sharelink2 = ShareLink(gallery=gallery, expires_at=datetime.now(UTC) + timedelta(days=1))

        db_session.add(user)
        db_session.add(gallery)
        db_session.add(photo1)
        db_session.add(photo2)
        db_session.add(sharelink1)
        db_session.add(sharelink2)
        db_session.commit()

        # Test all relationships
        assert gallery.owner == user
        assert gallery in user.galleries

        assert photo1 in gallery.photos
        assert photo2 in gallery.photos
        assert photo1.gallery == gallery
        assert photo2.gallery == gallery

        assert sharelink1 in gallery.share_links
        assert sharelink2 in gallery.share_links
        assert sharelink1.gallery == gallery
        assert sharelink2.gallery == gallery

    def test_cascade_delete_complete_chain(self, db_session):
        """Test cascade deletion throughout the model chain."""
        user = User(email="cascade_all@example.com", password_hash="hash")
        gallery = Gallery(owner=user)
        photo = Photo(gallery=gallery, object_key="test.jpg", thumbnail_object_key="test.jpg", file_size=1024)
        sharelink = ShareLink(gallery=gallery)

        db_session.add(user)
        db_session.add(gallery)
        db_session.add(photo)
        db_session.add(sharelink)
        db_session.commit()

        # Store IDs for checking deletion
        gallery_id = gallery.id
        photo_id = photo.id
        sharelink_id = sharelink.id

        # Delete user - should cascade to everything
        db_session.delete(user)
        db_session.commit()

        # Everything should be deleted
        assert db_session.get(Gallery, gallery_id) is None
        assert db_session.get(Photo, photo_id) is None
        assert db_session.get(ShareLink, sharelink_id) is None
