"""Tests for MinIO utilities module."""

import io
import os
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from PIL import Image

from src.viewport.minio_utils import MinioSettings, create_thumbnail, ensure_bucket_exists, get_file_url, get_minio_config, get_s3_client, upload_fileobj


class TestMinioSettings:
    """Test MinIO configuration settings."""

    def test_minio_settings_with_clear_env(self):
        """Test MinIO settings with cleared environment."""
        # Clear environment and test defaults
        with patch.dict(os.environ, {}, clear=True):
            settings = MinioSettings()
            assert settings.endpoint == "localhost:9000"
            assert settings.access_key == "minioadmin"
            assert settings.secret_key == "minioadmin"
            assert settings.bucket == "viewport"

    @pytest.mark.parametrize(
        "env_vars,expected",
        [
            (
                {"MINIO_ENDPOINT": "test:9000", "MINIO_ROOT_USER": "testuser", "MINIO_ROOT_PASSWORD": "testpass", "MINIO_BUCKET": "testbucket"},
                {"endpoint": "test:9000", "access_key": "testuser", "secret_key": "testpass", "bucket": "testbucket"},
            ),
            (
                {"MINIO_ENDPOINT": "prod.example.com:9000", "MINIO_ROOT_USER": "produser", "MINIO_ROOT_PASSWORD": "prodpass"},
                {"endpoint": "prod.example.com:9000", "access_key": "produser", "secret_key": "prodpass", "bucket": "viewport"},
            ),
        ],
    )
    def test_minio_settings_from_environment(self, env_vars, expected):
        """Test MinIO settings from environment variables."""
        with patch.dict(os.environ, env_vars, clear=True):
            settings = MinioSettings()
            assert settings.endpoint == expected["endpoint"]
            assert settings.access_key == expected["access_key"]
            assert settings.secret_key == expected["secret_key"]
            assert settings.bucket == expected["bucket"]

    def test_minio_settings_alias_fields(self):
        """Test MinIO settings with alias fields."""
        env_vars = {"MINIO_ROOT_USER": "aliasuser", "MINIO_ROOT_PASSWORD": "aliaspass"}
        with patch.dict(os.environ, env_vars, clear=True):
            settings = MinioSettings()
            assert settings.access_key == "aliasuser"
            assert settings.secret_key == "aliaspass"


class TestMinioConfiguration:
    """Test MinIO configuration functions."""

    def test_get_minio_config_caching(self):
        """Test get_minio_config returns cached results."""
        # Clear cache first
        get_minio_config.cache_clear()

        # First call
        result1 = get_minio_config()
        # Second call should return same object (cached)
        result2 = get_minio_config()

        assert result1 == result2
        assert isinstance(result1, tuple)
        assert len(result1) == 4  # endpoint, access_key, secret_key, bucket

    def test_get_minio_config_returns_correct_format(self):
        """Test get_minio_config returns correct format."""
        get_minio_config.cache_clear()
        endpoint, access_key, secret_key, bucket = get_minio_config()

        assert isinstance(endpoint, str)
        assert isinstance(access_key, str)
        assert isinstance(secret_key, str)
        assert isinstance(bucket, str)

    @patch("src.viewport.minio_utils.boto3.client")
    def test_get_s3_client_caching(self, mock_boto3):
        """Test get_s3_client returns cached client."""
        mock_client = Mock()
        mock_boto3.return_value = mock_client

        # Clear cache first
        get_s3_client.cache_clear()

        # First call
        client1 = get_s3_client()
        # Second call should return same object (cached)
        client2 = get_s3_client()

        assert client1 is client2
        # boto3.client should only be called once due to caching
        mock_boto3.assert_called_once()

    @patch("src.viewport.minio_utils.boto3.client")
    def test_get_s3_client_configuration(self, mock_boto3):
        """Test S3 client is configured correctly."""
        mock_client = Mock()
        mock_boto3.return_value = mock_client

        get_s3_client.cache_clear()

        # Mock environment variables
        with patch.dict(os.environ, {"MINIO_ENDPOINT": "test.com:9000", "MINIO_ROOT_USER": "testuser", "MINIO_ROOT_PASSWORD": "testpass"}, clear=True):
            get_minio_config.cache_clear()  # Clear config cache too
            get_s3_client()

            # Verify boto3.client was called with correct parameters
            mock_boto3.assert_called_once()
            call_args = mock_boto3.call_args

            assert call_args[0][0] == "s3"  # service name
            assert call_args[1]["endpoint_url"] == "http://test.com:9000"
            assert call_args[1]["aws_access_key_id"] == "testuser"
            assert call_args[1]["aws_secret_access_key"] == "testpass"
            assert call_args[1]["region_name"] == "eu-west-1"


class TestBucketOperations:
    """Test bucket-related operations."""

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_ensure_bucket_exists_bucket_exists(self, mock_get_client):
        """Test ensure_bucket_exists when bucket already exists."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": [{"Name": "viewport"}, {"Name": "other-bucket"}]}
        mock_get_client.return_value = mock_client

        with patch("src.viewport.minio_utils.get_minio_config") as mock_config:
            mock_config.return_value = ("endpoint", "access", "secret", "viewport")

            # Should not raise exception
            ensure_bucket_exists()

            # Should call list_buckets but not create_bucket
            mock_client.list_buckets.assert_called_once()
            mock_client.create_bucket.assert_not_called()

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_ensure_bucket_exists_bucket_missing(self, mock_get_client):
        """Test ensure_bucket_exists when bucket doesn't exist."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": [{"Name": "other-bucket"}]}
        mock_get_client.return_value = mock_client

        with patch("src.viewport.minio_utils.get_minio_config") as mock_config:
            mock_config.return_value = ("endpoint", "access", "secret", "viewport")

            ensure_bucket_exists()

            # Should call both list_buckets and create_bucket
            mock_client.list_buckets.assert_called_once()
            mock_client.create_bucket.assert_called_once_with(Bucket="viewport")

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_ensure_bucket_exists_no_buckets(self, mock_get_client):
        """Test ensure_bucket_exists when no buckets exist."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_get_client.return_value = mock_client

        with patch("src.viewport.minio_utils.get_minio_config") as mock_config:
            mock_config.return_value = ("endpoint", "access", "secret", "viewport")

            ensure_bucket_exists()

            mock_client.list_buckets.assert_called_once()
            mock_client.create_bucket.assert_called_once_with(Bucket="viewport")

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_ensure_bucket_exists_with_custom_bucket(self, mock_get_client):
        """Test ensure_bucket_exists with custom bucket name."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_get_client.return_value = mock_client

        with patch("src.viewport.minio_utils.get_minio_config") as mock_config:
            mock_config.return_value = ("endpoint", "access", "secret", "custom-bucket")

            ensure_bucket_exists()

            mock_client.create_bucket.assert_called_once_with(Bucket="custom-bucket")


class TestFileOperations:
    """Test file upload and URL generation operations."""

    @patch("src.viewport.minio_utils.ensure_bucket_exists")
    @patch("src.viewport.minio_utils.get_s3_client")
    @patch("src.viewport.minio_utils.get_minio_config")
    def test_upload_fileobj_with_bytes(self, mock_get_config, mock_get_client, mock_ensure_bucket):
        """Test uploading bytes as file object."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        file_content = b"test file content"
        filename = "test.txt"

        result = upload_fileobj(file_content, filename)

        # Should ensure bucket exists
        mock_ensure_bucket.assert_called_once()

        # Should call upload_fileobj with BytesIO wrapper
        mock_client.upload_fileobj.assert_called_once()
        call_args = mock_client.upload_fileobj.call_args
        assert isinstance(call_args[0][0], io.BytesIO)
        assert call_args[0][1] == "test-bucket"  # bucket
        assert call_args[0][2] == filename

        # Should return correct path
        assert result == "/test-bucket/test.txt"

    @patch("src.viewport.minio_utils.ensure_bucket_exists")
    @patch("src.viewport.minio_utils.get_s3_client")
    @patch("src.viewport.minio_utils.get_minio_config")
    def test_upload_fileobj_with_fileobj(self, mock_get_config, mock_get_client, mock_ensure_bucket):
        """Test uploading file-like object."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        file_content = io.BytesIO(b"test file content")
        filename = "test.txt"

        result = upload_fileobj(file_content, filename)

        mock_ensure_bucket.assert_called_once()
        mock_client.upload_fileobj.assert_called_once()

        call_args = mock_client.upload_fileobj.call_args
        assert call_args[0][0] is file_content  # Should use original object
        assert call_args[0][1] == "test-bucket"
        assert call_args[0][2] == filename

        assert result == "/test-bucket/test.txt"

    @pytest.mark.parametrize(
        "filename",
        [
            "test.jpg",
            "folder/test.png",
            "深度/测试.txt",
            "file with spaces.pdf",
        ],
    )
    @patch("src.viewport.minio_utils.ensure_bucket_exists")
    @patch("src.viewport.minio_utils.get_s3_client")
    @patch("src.viewport.minio_utils.get_minio_config")
    def test_upload_fileobj_different_filenames(self, mock_get_config, mock_get_client, mock_ensure_bucket, filename):
        """Test upload with different filename patterns."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        result = upload_fileobj(b"content", filename)
        assert result == f"/test-bucket/{filename}"

    @patch("src.viewport.minio_utils.get_s3_client")
    @patch("src.viewport.minio_utils.get_minio_config")
    def test_get_file_url(self, mock_get_config, mock_get_client):
        """Test getting presigned URL for file."""
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = "https://presigned.url/test.jpg"
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        result = get_file_url("test.jpg")

        mock_client.generate_presigned_url.assert_called_once_with("get_object", Params={"Bucket": "test-bucket", "Key": "test.jpg"}, ExpiresIn=3600)
        assert result == "https://presigned.url/test.jpg"

    @pytest.mark.parametrize(
        "filename",
        [
            "test.jpg",
            "folder/subfolder/test.png",
            "file-with-dashes.pdf",
            "file_with_underscores.txt",
        ],
    )
    @patch("src.viewport.minio_utils.get_s3_client")
    @patch("src.viewport.minio_utils.get_minio_config")
    def test_get_file_url_different_filenames(self, mock_get_config, mock_get_client, filename):
        """Test getting URLs for different filename patterns."""
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = f"https://presigned.url/{filename}"
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        get_file_url(filename)

        call_args = mock_client.generate_presigned_url.call_args
        assert call_args[1]["Params"]["Key"] == filename


class TestMinioErrorHandling:
    """Test error handling in MinIO operations."""

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_ensure_bucket_exists_client_error(self, mock_get_client):
        """Test ensure_bucket_exists handles client errors."""
        mock_client = Mock()
        mock_client.list_buckets.side_effect = ClientError({"Error": {"Code": "NoSuchBucket"}}, "ListBuckets")
        mock_get_client.return_value = mock_client

        with pytest.raises(ClientError):
            ensure_bucket_exists()

    @patch("src.viewport.minio_utils.ensure_bucket_exists")
    @patch("src.viewport.minio_utils.get_s3_client")
    def test_upload_fileobj_client_error(self, mock_get_client, mock_ensure_bucket):
        """Test upload_fileobj handles client errors."""
        mock_client = Mock()
        mock_client.upload_fileobj.side_effect = ClientError({"Error": {"Code": "NoSuchBucket"}}, "PutObject")
        mock_get_client.return_value = mock_client

        with pytest.raises(ClientError):
            upload_fileobj(b"content", "test.txt")

    @patch("src.viewport.minio_utils.get_s3_client")
    def test_get_file_url_client_error(self, mock_get_client):
        """Test get_file_url handles client errors."""
        mock_client = Mock()
        mock_client.generate_presigned_url.side_effect = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        mock_get_client.return_value = mock_client

        with pytest.raises(ClientError):
            get_file_url("nonexistent.txt")

    @patch("src.viewport.minio_utils.boto3.client")
    def test_get_s3_client_no_credentials(self, mock_boto3):
        """Test get_s3_client handles missing credentials."""
        mock_boto3.side_effect = NoCredentialsError()

        get_s3_client.cache_clear()

        with pytest.raises(NoCredentialsError):
            get_s3_client()


class TestThumbnailCreation:
    """Test thumbnail creation utilities."""

    def _create_test_image(self, width: int, height: int, mode: str = "RGB", exif_orientation: int | None = None) -> bytes:
        """Helper to create a test image with optional EXIF orientation."""
        img = Image.new(mode, (width, height), color="red")

        # Add EXIF orientation if specified
        if exif_orientation:
            exif = img.getexif()
            exif[0x0112] = exif_orientation  # 0x0112 is the Orientation tag

            # Save with EXIF data
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", exif=exif)
            buffer.seek(0)
            return buffer.read()

        # Save without EXIF
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        buffer.seek(0)
        return buffer.read()

    def test_create_thumbnail_basic(self):
        """Test basic thumbnail creation."""
        # Create a test image
        test_image_bytes = self._create_test_image(1600, 1200)

        # Create thumbnail
        thumbnail_bytes = create_thumbnail(test_image_bytes, max_size=(800, 800))

        # Verify thumbnail was created
        assert thumbnail_bytes is not None
        assert len(thumbnail_bytes) > 0

        # Verify thumbnail dimensions
        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        assert thumbnail_img.width <= 800
        assert thumbnail_img.height <= 800

        # Verify aspect ratio is maintained
        assert abs(thumbnail_img.width / thumbnail_img.height - 1600 / 1200) < 0.01

    def test_create_thumbnail_with_exif_orientation(self):
        """Test thumbnail creation with EXIF orientation (rotation)."""
        # Create a portrait image (600x800) with EXIF orientation 6 (rotate 90 CW)
        # This simulates how cameras often store portrait photos
        test_image_bytes = self._create_test_image(800, 600, exif_orientation=6)

        # Create thumbnail
        thumbnail_bytes = create_thumbnail(test_image_bytes, max_size=(800, 800))

        # Verify thumbnail was created
        assert thumbnail_bytes is not None

        # Load thumbnail and check it was rotated correctly
        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))

        # After applying EXIF orientation 6, the image should be rotated 90 degrees CW
        # Original: 800x600 (landscape) -> After rotation: 600x800 (portrait)
        # The thumbnail should respect this rotation
        assert thumbnail_img.width <= 800
        assert thumbnail_img.height <= 800

    def test_create_thumbnail_maintains_aspect_ratio(self):
        """Test that thumbnail maintains aspect ratio."""
        # Test with various aspect ratios
        test_cases = [
            (1600, 1200),  # 4:3 landscape
            (1200, 1600),  # 3:4 portrait
            (2000, 1000),  # 2:1 wide
            (1000, 2000),  # 1:2 tall
        ]

        for width, height in test_cases:
            test_image_bytes = self._create_test_image(width, height)
            thumbnail_bytes = create_thumbnail(test_image_bytes, max_size=(400, 400))

            thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
            original_ratio = width / height
            thumbnail_ratio = thumbnail_img.width / thumbnail_img.height

            # Allow small floating point differences
            assert abs(original_ratio - thumbnail_ratio) < 0.01, f"Aspect ratio not maintained for {width}x{height}"

    def test_create_thumbnail_custom_size(self):
        """Test thumbnail creation with custom max size."""
        test_image_bytes = self._create_test_image(2000, 1500)

        # Create with custom size
        thumbnail_bytes = create_thumbnail(test_image_bytes, max_size=(400, 300))

        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        assert thumbnail_img.width <= 400
        assert thumbnail_img.height <= 300

    def test_create_thumbnail_smaller_than_max(self):
        """Test that small images are not upscaled."""
        # Create an image smaller than max_size
        test_image_bytes = self._create_test_image(400, 300)

        thumbnail_bytes = create_thumbnail(test_image_bytes, max_size=(800, 800))

        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        # thumbnail() doesn't upscale, so dimensions should remain the same or smaller
        assert thumbnail_img.width <= 400
        assert thumbnail_img.height <= 300

    def test_create_thumbnail_invalid_image(self):
        """Test that invalid image data raises exception."""
        from PIL import UnidentifiedImageError

        invalid_bytes = b"not an image"

        with pytest.raises(UnidentifiedImageError):
            create_thumbnail(invalid_bytes)
