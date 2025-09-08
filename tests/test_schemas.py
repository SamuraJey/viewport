"""Tests for Pydantic schemas."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from src.viewport.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, RegisterResponse, TokenPair
from src.viewport.schemas.gallery import GalleryCreateRequest, GalleryDetailResponse, GalleryListResponse, GalleryResponse
from src.viewport.schemas.photo import PhotoCreateRequest, PhotoListResponse, PhotoResponse
from src.viewport.schemas.sharelink import ShareLinkCreateRequest, ShareLinkResponse


class TestAuthSchemas:
    """Test authentication-related schemas."""

    def test_register_request_valid(self):
        """Test valid register request."""
        data = {"email": "test@example.com", "password": "password123"}
        request = RegisterRequest(**data)

        assert request.email == "test@example.com"
        assert request.password == "password123"

    @pytest.mark.parametrize(
        "invalid_email",
        [
            "notanemail",
            "@example.com",
            "test@",
            "test.example.com",
            "",
        ],
    )
    def test_register_request_invalid_email(self, invalid_email):
        """Test register request with invalid email."""
        data = {"email": invalid_email, "password": "password123"}
        with pytest.raises(ValidationError):
            RegisterRequest(**data)

    @pytest.mark.parametrize(
        "invalid_password",
        [
            "short",  # Too short
            "",  # Empty
            "a" * 129,  # Too long
        ],
    )
    def test_register_request_invalid_password(self, invalid_password):
        """Test register request with invalid password."""
        data = {"email": "test@example.com", "password": invalid_password}
        with pytest.raises(ValidationError):
            RegisterRequest(**data)

    def test_register_response_valid(self):
        """Test valid register response."""
        data = {"id": str(uuid.uuid4()), "email": "test@example.com"}
        response = RegisterResponse(**data)

        assert response.id == data["id"]
        assert response.email == "test@example.com"

    def test_login_request_valid(self):
        """Test valid login request."""
        data = {"email": "test@example.com", "password": "password123"}
        request = LoginRequest(**data)

        assert request.email == "test@example.com"
        assert request.password == "password123"

    def test_token_pair_valid(self):
        """Test valid token pair."""
        data = {"access_token": "access_token_123", "refresh_token": "refresh_token_456"}
        token_pair = TokenPair(**data)

        assert token_pair.access_token == "access_token_123"
        assert token_pair.refresh_token == "refresh_token_456"
        assert token_pair.token_type == "bearer"  # Default value

    def test_token_pair_custom_type(self):
        """Test token pair with custom token type."""
        data = {"access_token": "access_token_123", "refresh_token": "refresh_token_456", "token_type": "custom"}
        token_pair = TokenPair(**data)

        assert token_pair.token_type == "custom"

    def test_login_response_valid(self):
        """Test valid login response."""
        user_id = str(uuid.uuid4())
        data = {"id": user_id, "email": "test@example.com", "tokens": {"access_token": "access_123", "refresh_token": "refresh_456"}}
        response = LoginResponse(**data)

        assert response.id == user_id
        assert response.email == "test@example.com"
        assert response.tokens.access_token == "access_123"
        assert response.tokens.refresh_token == "refresh_456"

    def test_refresh_request_valid(self):
        """Test valid refresh request."""
        data = {"refresh_token": "refresh_token_123"}
        request = RefreshRequest(**data)

        assert request.refresh_token == "refresh_token_123"

    def test_refresh_request_missing_token(self):
        """Test refresh request with missing token."""
        with pytest.raises(ValidationError):
            RefreshRequest()


class TestGallerySchemas:
    """Test gallery-related schemas."""

    def test_gallery_create_request(self):
        """Test gallery create request (empty)."""
        request = GalleryCreateRequest()
        # Should create successfully with no fields
        assert isinstance(request, GalleryCreateRequest)

    def test_gallery_response_valid(self):
        """Test valid gallery response."""
        gallery_id = str(uuid.uuid4())
        owner_id = str(uuid.uuid4())
        created_at = datetime.now(UTC)

        data = {"id": gallery_id, "owner_id": owner_id, "created_at": created_at}
        response = GalleryResponse(**data)

        assert response.id == gallery_id
        assert response.owner_id == owner_id
        assert response.created_at == created_at

    def test_gallery_detail_response_valid(self):
        """Test valid gallery detail response."""
        gallery_id = str(uuid.uuid4())
        owner_id = str(uuid.uuid4())
        created_at = datetime.now(UTC)

        photos = []
        share_links = []

        data = {"id": gallery_id, "owner_id": owner_id, "created_at": created_at, "photos": photos, "share_links": share_links}
        response = GalleryDetailResponse(**data)

        assert response.id == gallery_id
        assert response.owner_id == owner_id
        assert response.created_at == created_at
        assert response.photos == []
        assert response.share_links == []

    def test_gallery_list_response_valid(self):
        """Test valid gallery list response."""
        gallery_id = str(uuid.uuid4())
        owner_id = str(uuid.uuid4())
        created_at = datetime.now(UTC)

        galleries = [{"id": gallery_id, "owner_id": owner_id, "created_at": created_at}]

        data = {"galleries": galleries, "total": 1, "page": 1, "size": 10}
        response = GalleryListResponse(**data)

        assert len(response.galleries) == 1
        assert response.galleries[0].id == gallery_id
        assert response.total == 1
        assert response.page == 1
        assert response.size == 10

    @pytest.mark.parametrize(
        "total,page,size",
        [
            (0, 1, 10),
            (50, 5, 10),
            (100, 1, 25),
        ],
    )
    def test_gallery_list_response_pagination(self, total, page, size):
        """Test gallery list response with different pagination values."""
        data = {"galleries": [], "total": total, "page": page, "size": size}
        response = GalleryListResponse(**data)

        assert response.total == total
        assert response.page == page
        assert response.size == size


class TestPhotoSchemas:
    """Test photo-related schemas."""

    def test_photo_create_request_valid(self):
        """Test valid photo create request."""
        data = {"file_size": 1024}
        request = PhotoCreateRequest(**data)

        assert request.file_size == 1024

    @pytest.mark.parametrize(
        "invalid_size",
        [
            0,  # Zero
            -1,  # Negative
            -100,  # Large negative
        ],
    )
    def test_photo_create_request_invalid_size(self, invalid_size):
        """Test photo create request with invalid file size."""
        data = {"file_size": invalid_size}
        with pytest.raises(ValidationError):
            PhotoCreateRequest(**data)

    def test_photo_create_request_missing_size(self):
        """Test photo create request with missing file size."""
        with pytest.raises(ValidationError):
            PhotoCreateRequest()

    def test_photo_response_valid(self):
        """Test valid photo response."""
        photo_id = uuid.uuid4()
        gallery_id = uuid.uuid4()
        uploaded_at = datetime.now(UTC)

        data = {"id": photo_id, "gallery_id": gallery_id, "url": "/photos/test.jpg", "file_size": 2048, "uploaded_at": uploaded_at}
        response = PhotoResponse(**data)

        assert response.id == photo_id
        assert response.gallery_id == gallery_id
        assert response.url == "/photos/test.jpg"
        assert response.file_size == 2048
        assert response.uploaded_at == uploaded_at

    def test_photo_response_from_db_photo(self):
        """Test creating PhotoResponse from database photo."""
        from unittest.mock import patch

        # Mock database photo object
        mock_photo = Mock()
        mock_photo.id = uuid.uuid4()
        mock_photo.gallery_id = uuid.uuid4()
        mock_photo.file_size = 1024
        mock_photo.uploaded_at = datetime.now(UTC)
        mock_photo.object_key = f"{mock_photo.gallery_id}/test.jpg"

        # Mock the presigned URL generation
        expected_url = f"https://example.com/presigned-url/{mock_photo.id}"
        with patch("src.viewport.schemas.photo.generate_presigned_url", return_value=expected_url):
            response = PhotoResponse.from_db_photo(mock_photo)

        assert response.id == mock_photo.id
        assert response.gallery_id == mock_photo.gallery_id
        assert response.file_size == mock_photo.file_size
        assert response.uploaded_at == mock_photo.uploaded_at
        assert response.url == expected_url

    def test_photo_list_response_valid(self):
        """Test valid photo list response."""
        photo_id = uuid.uuid4()
        gallery_id = uuid.uuid4()
        uploaded_at = datetime.now(UTC)

        photos = [{"id": photo_id, "gallery_id": gallery_id, "url": "/photos/test.jpg", "file_size": 1024, "uploaded_at": uploaded_at}]

        data = {"photos": photos, "total": 1, "page": 1, "size": 10}
        response = PhotoListResponse(**data)

        assert len(response.photos) == 1
        assert response.photos[0].id == photo_id
        assert response.total == 1
        assert response.page == 1
        assert response.size == 10


class TestShareLinkSchemas:
    """Test share link-related schemas."""

    def test_sharelink_create_request_valid(self):
        """Test valid share link create request."""
        gallery_id = uuid.uuid4()
        expires_at = datetime.now(UTC) + timedelta(days=1)

        data = {"gallery_id": gallery_id, "expires_at": expires_at}
        request = ShareLinkCreateRequest(**data)

        assert request.gallery_id == gallery_id
        assert request.expires_at == expires_at

    def test_sharelink_create_request_no_expiry(self):
        """Test share link create request without expiry."""
        gallery_id = uuid.uuid4()

        data = {"gallery_id": gallery_id}
        request = ShareLinkCreateRequest(**data)

        assert request.gallery_id == gallery_id
        assert request.expires_at is None

    def test_sharelink_response_valid(self):
        """Test valid share link response."""
        sharelink_id = uuid.uuid4()
        gallery_id = uuid.uuid4()
        expires_at = datetime.now(UTC) + timedelta(days=1)
        created_at = datetime.now(UTC)

        data = {"id": sharelink_id, "gallery_id": gallery_id, "expires_at": expires_at, "views": 5, "zip_downloads": 2, "single_downloads": 10, "created_at": created_at}
        response = ShareLinkResponse(**data)

        assert response.id == sharelink_id
        assert response.gallery_id == gallery_id
        assert response.expires_at == expires_at
        assert response.views == 5
        assert response.zip_downloads == 2
        assert response.single_downloads == 10
        assert response.created_at == created_at

    @pytest.mark.parametrize(
        "views,zip_downloads,single_downloads",
        [
            (0, 0, 0),
            (100, 25, 75),
            (1000, 500, 2000),
        ],
    )
    def test_sharelink_response_different_counters(self, views, zip_downloads, single_downloads):
        """Test share link response with different counter values."""
        sharelink_id = uuid.uuid4()
        gallery_id = uuid.uuid4()
        created_at = datetime.now(UTC)

        data = {"id": sharelink_id, "gallery_id": gallery_id, "views": views, "zip_downloads": zip_downloads, "single_downloads": single_downloads, "created_at": created_at}
        response = ShareLinkResponse(**data)

        assert response.views == views
        assert response.zip_downloads == zip_downloads
        assert response.single_downloads == single_downloads


class TestSchemaEdgeCases:
    """Test edge cases and error handling in schemas."""

    def test_uuid_string_conversion(self):
        """Test UUID fields accept string representations."""
        gallery_id = uuid.uuid4()
        data = {
            "gallery_id": str(gallery_id),  # String instead of UUID
            "expires_at": None,
        }
        request = ShareLinkCreateRequest(**data)

        assert request.gallery_id == gallery_id

    def test_datetime_iso_string_conversion(self):
        """Test datetime fields accept ISO string representations."""
        gallery_id = uuid.uuid4()
        expires_at = datetime.now(UTC) + timedelta(days=1)

        data = {
            "gallery_id": gallery_id,
            "expires_at": expires_at.isoformat(),  # ISO string
        }
        request = ShareLinkCreateRequest(**data)

        # Should be converted back to datetime
        assert isinstance(request.expires_at, datetime)

    def test_schema_json_serialization(self):
        """Test schemas can be serialized to JSON."""
        data = {"email": "test@example.com", "password": "password123"}
        request = RegisterRequest(**data)

        # Should be able to serialize
        json_data = request.model_dump()
        assert json_data["email"] == "test@example.com"
        assert json_data["password"] == "password123"

    def test_schema_extra_fields_ignored(self):
        """Test schemas ignore extra fields."""
        data = {"email": "test@example.com", "password": "password123", "extra_field": "should_be_ignored"}
        request = RegisterRequest(**data)

        assert request.email == "test@example.com"
        assert request.password == "password123"
        assert not hasattr(request, "extra_field")

    @pytest.mark.parametrize(
        "field_name,field_value",
        [
            ("email", None),
            ("password", None),
            ("email", 123),  # Wrong type
            ("password", 456),  # Wrong type
        ],
    )
    def test_schema_validation_errors(self, field_name, field_value):
        """Test schema validation errors for various invalid inputs."""
        base_data = {"email": "test@example.com", "password": "password123"}
        base_data[field_name] = field_value

        with pytest.raises(ValidationError):
            RegisterRequest(**base_data)
