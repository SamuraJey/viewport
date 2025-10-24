"""Tests for MinIO utilities module."""

import io
import os
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError
from PIL import Image

from viewport.minio_utils import (
    S3Settings,
    async_create_and_upload_thumbnail,
    async_ensure_bucket_exists,
    async_generate_presigned_urls_batch,
    async_process_and_upload_image,
    async_upload_fileobj,
    create_thumbnail,
    delete_folder,
    delete_object,
    generate_presigned_url,
    generate_thumbnail_object_key,
    get_minio_config,
    get_s3_client,
    process_image_and_create_thumbnail,
    rename_object,
)


class TestMinioSettings:
    """Test MinIO configuration settings."""

    def test_minio_settings_with_clear_env(self):
        """Test MinIO settings with cleared environment."""
        # Clear environment and test defaults
        with patch.dict(os.environ, {}, clear=True):
            settings = S3Settings()
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
            settings = S3Settings()
            assert settings.endpoint == expected["endpoint"]
            assert settings.access_key == expected["access_key"]
            assert settings.secret_key == expected["secret_key"]
            assert settings.bucket == expected["bucket"]

    def test_minio_settings_alias_fields(self):
        """Test MinIO settings with alias fields."""
        env_vars = {"MINIO_ROOT_USER": "aliasuser", "MINIO_ROOT_PASSWORD": "aliaspass"}
        with patch.dict(os.environ, env_vars, clear=True):
            settings = S3Settings()
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
        assert len(result1) == 6

    @patch("viewport.minio_utils.boto3.client")
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

    @patch("viewport.minio_utils.boto3.client")
    def test_get_s3_client_configuration(self, mock_boto3):
        """Test S3 client is configured correctly."""
        mock_client = Mock()
        mock_boto3.return_value = mock_client

        get_s3_client.cache_clear()

        # Mock environment variables
        with patch.dict(os.environ, {"MINIO_ENDPOINT": "http://test.com:9000", "MINIO_ROOT_USER": "testuser", "MINIO_ROOT_PASSWORD": "testpass"}, clear=True):
            get_minio_config.cache_clear()  # Clear config cache too
            get_s3_client()

            # Verify boto3.client was called with correct parameters
            mock_boto3.assert_called_once()
            call_args = mock_boto3.call_args

            assert call_args[0][0] == "s3"  # service name
            assert call_args[1]["endpoint_url"] == "http://test.com:9000"
            assert call_args[1]["aws_access_key_id"] == "testuser"
            assert call_args[1]["aws_secret_access_key"] == "testpass"


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
        thumbnail_bytes, width, height = create_thumbnail(test_image_bytes, max_size=(800, 800))

        # Verify thumbnail was created
        assert thumbnail_bytes is not None
        assert len(thumbnail_bytes) > 0
        assert width == 800 or height == 800

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
        thumbnail_bytes, w, h = create_thumbnail(test_image_bytes, max_size=(800, 800))

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
            thumbnail_bytes, w, h = create_thumbnail(test_image_bytes, max_size=(400, 400))

            thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
            original_ratio = width / height
            thumbnail_ratio = thumbnail_img.width / thumbnail_img.height

            # Allow small floating point differences
            assert abs(original_ratio - thumbnail_ratio) < 0.01, f"Aspect ratio not maintained for {width}x{height}"

    def test_create_thumbnail_custom_size(self):
        """Test thumbnail creation with custom max size."""
        test_image_bytes = self._create_test_image(2000, 1500)

        # Create with custom size
        thumbnail_bytes, w, h = create_thumbnail(test_image_bytes, max_size=(400, 300))

        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        assert thumbnail_img.width <= 400
        assert thumbnail_img.height <= 300

    def test_create_thumbnail_smaller_than_max(self):
        """Test that small images are not upscaled."""
        # Create an image smaller than max_size
        test_image_bytes = self._create_test_image(400, 300)

        thumbnail_bytes, w, h = create_thumbnail(test_image_bytes, max_size=(800, 800))

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


class TestPresignedURLGeneration:
    """Test presigned URL generation functions."""

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_generate_presigned_url_basic(self, mock_get_config, mock_get_client):
        """Test basic presigned URL generation."""
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = "https://presigned.url/test.jpg"
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = generate_presigned_url("test.jpg")

        mock_client.generate_presigned_url.assert_called_once_with("get_object", Params={"Bucket": "test-bucket", "Key": "test.jpg"}, ExpiresIn=3600)
        assert result == "https://presigned.url/test.jpg"

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_generate_presigned_url_custom_expiry(self, mock_get_config, mock_get_client):
        """Test presigned URL generation with custom expiry."""
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = "https://presigned.url/test.jpg"
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        # Ensure no cached URL exists
        with patch("viewport.minio_utils.get_cached_presigned_url", return_value=None):
            result = generate_presigned_url("test.jpg", expires_in=7200)

        mock_client.generate_presigned_url.assert_called_once_with("get_object", Params={"Bucket": "test-bucket", "Key": "test.jpg"}, ExpiresIn=7200)
        assert result == "https://presigned.url/test.jpg"

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_generate_presigned_url_caching(self, mock_get_config, mock_get_client):
        """Test presigned URL caching."""
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = "https://presigned.url/test.jpg"
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        # First call - no cache, should generate URL
        with patch("viewport.minio_utils.get_cached_presigned_url", return_value=None), patch("viewport.minio_utils.cache_presigned_url") as mock_cache:
            result1 = generate_presigned_url("test.jpg")
            mock_cache.assert_called_once()

        # Second call - cache hit, should return cached URL
        with patch("viewport.minio_utils.get_cached_presigned_url", return_value="https://cached.url/test.jpg"):
            result2 = generate_presigned_url("test.jpg")

        assert result1 == "https://presigned.url/test.jpg"
        assert result2 == "https://cached.url/test.jpg"
        # generate_presigned_url should only be called once (first call)
        assert mock_client.generate_presigned_url.call_count == 1

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_generate_presigned_url_error(self, mock_get_config, mock_get_client):
        """Test presigned URL generation error handling."""
        mock_client = Mock()
        mock_client.generate_presigned_url.side_effect = ClientError({"Error": {"Code": "InvalidBucketName"}}, "GetObject")
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        # Ensure no cached URL exists
        with patch("viewport.minio_utils.get_cached_presigned_url", return_value=None), pytest.raises(ClientError):
            generate_presigned_url("test.jpg")

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_generate_presigned_urls_batch(self, mock_get_config, mock_get_client):
        """Test async batch presigned URL generation."""
        mock_client = Mock()
        mock_client.generate_presigned_url.side_effect = [
            "https://presigned.url/key1.jpg",
            "https://presigned.url/key2.jpg",
        ]
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        # Mock cache to return None for all keys (no cached URLs)
        with patch("viewport.minio_utils.get_cached_presigned_url", return_value=None), patch("viewport.minio_utils.cache_presigned_url"):
            object_keys = ["key1.jpg", "key2.jpg"]
            result = await async_generate_presigned_urls_batch(object_keys)
            assert len(result) == 2
            assert result["key1.jpg"] == "https://presigned.url/key1.jpg"
            assert result["key2.jpg"] == "https://presigned.url/key2.jpg"


class TestObjectOperations:
    """Test object operations like rename and delete."""

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_rename_object_success(self, mock_get_config, mock_get_client):
        """Test successful object rename."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = rename_object("old-key.jpg", "new-key.jpg")

        assert result is True
        mock_client.copy_object.assert_called_once_with(CopySource={"Bucket": "test-bucket", "Key": "old-key.jpg"}, Bucket="test-bucket", Key="new-key.jpg")
        mock_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="old-key.jpg")

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_rename_object_copy_error(self, mock_get_config, mock_get_client):
        """Test object rename with copy error."""
        mock_client = Mock()
        mock_client.copy_object.side_effect = ClientError({"Error": {"Code": "NoSuchKey"}}, "CopyObject")
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = rename_object("old-key.jpg", "new-key.jpg")

        assert result is False

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_delete_object_success(self, mock_get_config, mock_get_client):
        """Test successful object deletion."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = delete_object("test-key.jpg")

        assert result is True
        mock_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="test-key.jpg")

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_delete_object_error(self, mock_get_config, mock_get_client):
        """Test object deletion with error."""
        mock_client = Mock()
        mock_client.delete_object.side_effect = ClientError({"Error": {"Code": "NoSuchKey"}}, "DeleteObject")
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = delete_object("test-key.jpg")

        assert result is False

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_delete_folder_success(self, mock_get_config, mock_get_client):
        """Test successful folder deletion."""
        mock_client = Mock()
        mock_paginator = Mock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_page = {"Contents": [{"Key": "folder/file1.jpg"}, {"Key": "folder/file2.jpg"}]}
        mock_paginator.paginate.return_value = [mock_page]
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = delete_folder("folder/")

        assert result is True
        mock_client.delete_objects.assert_called_once_with(Bucket="test-bucket", Delete={"Objects": [{"Key": "folder/file1.jpg"}, {"Key": "folder/file2.jpg"}]})

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_delete_folder_empty(self, mock_get_config, mock_get_client):
        """Test folder deletion with no objects."""
        mock_client = Mock()
        mock_paginator = Mock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_page = {}  # No Contents
        mock_paginator.paginate.return_value = [mock_page]
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = delete_folder("empty-folder/")

        assert result is True
        mock_client.delete_objects.assert_not_called()

    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    def test_delete_folder_error(self, mock_get_config, mock_get_client):
        """Test folder deletion with error."""
        mock_client = Mock()
        mock_client.get_paginator.side_effect = ClientError({"Error": {"Code": "NoSuchBucket"}}, "ListObjectsV2")
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        result = delete_folder("folder/")

        assert result is False


class TestImageProcessing:
    """Test image processing functions."""

    def _create_test_image(self, width: int, height: int, mode: str = "RGB") -> bytes:
        """Helper to create a test image."""
        img = Image.new(mode, (width, height), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        buffer.seek(0)
        return buffer.read()

    def test_process_image_and_create_thumbnail(self):
        """Test process_image_and_create_thumbnail function."""
        test_image_bytes = self._create_test_image(1600, 1200)

        thumbnail_bytes, width, height = process_image_and_create_thumbnail(test_image_bytes)

        assert thumbnail_bytes is not None
        assert len(thumbnail_bytes) > 0
        assert width == 1600
        assert height == 1200

        # Verify thumbnail dimensions
        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        assert thumbnail_img.width <= 800
        assert thumbnail_img.height <= 800

    def test_process_image_and_create_thumbnail_custom_size(self):
        """Test process_image_and_create_thumbnail with custom size."""
        test_image_bytes = self._create_test_image(2000, 1500)

        thumbnail_bytes, width, height = process_image_and_create_thumbnail(test_image_bytes, max_size=(400, 300))

        assert width == 2000
        assert height == 1500

        thumbnail_img = Image.open(io.BytesIO(thumbnail_bytes))
        assert thumbnail_img.width <= 400
        assert thumbnail_img.height <= 300

    def test_process_image_and_create_thumbnail_invalid_image(self):
        """Test process_image_and_create_thumbnail with invalid image."""
        from PIL import UnidentifiedImageError

        invalid_bytes = b"not an image"

        with pytest.raises(UnidentifiedImageError):
            process_image_and_create_thumbnail(invalid_bytes)

    @pytest.mark.parametrize(
        "original_key,expected_thumbnail_key",
        [
            ("gallery1/photo.jpg", "gallery1/thumbnails/photo.jpg"),
            ("simple.jpg", "thumbnails/simple.jpg"),
            ("path/to/file.png", "path/thumbnails/to/file.png"),
        ],
    )
    def test_generate_thumbnail_object_key(self, original_key, expected_thumbnail_key):
        """Test thumbnail object key generation."""
        result = generate_thumbnail_object_key(original_key)
        assert result == expected_thumbnail_key


class TestAsyncOperations:
    """Test async operations."""

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_ensure_bucket_exists")
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_upload_fileobj_bytes(self, mock_get_config, mock_get_client, mock_ensure_bucket):
        """Test async upload with bytes."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        file_content = b"test content"
        result = await async_upload_fileobj(file_content, "test.txt")

        assert result == "/test-bucket/test.txt"
        mock_ensure_bucket.assert_called_once()

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_ensure_bucket_exists")
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_upload_fileobj_with_metadata(self, mock_get_config, mock_get_client, mock_ensure_bucket):
        """Test async upload with metadata."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        file_content = b"test content"
        metadata = {"Content-Type": "text/plain"}
        result = await async_upload_fileobj(file_content, "test.txt", metadata)

        assert result == "/test-bucket/test.txt"
        # Verify metadata was passed to upload_fileobj
        call_args = mock_client.upload_fileobj.call_args
        assert call_args[1]["ExtraArgs"]["Metadata"] == metadata

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_upload_fileobj")
    @patch("viewport.minio_utils.process_image_and_create_thumbnail")
    async def test_async_create_and_upload_thumbnail(self, mock_process, mock_upload):
        """Test async thumbnail creation and upload."""
        # Mock the processing function
        mock_process.return_value = (b"thumbnail_bytes", 800, 600)
        mock_upload.return_value = "/bucket/thumbnails/test.jpg"

        result = await async_create_and_upload_thumbnail(b"image_bytes", "test.jpg")

        assert result == ("thumbnails/test.jpg", 800, 600)
        mock_process.assert_called_once_with(b"image_bytes", (800, 800), 85)
        mock_upload.assert_called_once_with(b"thumbnail_bytes", "thumbnails/test.jpg", content_type="image/jpeg")

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_upload_fileobj")
    @patch("viewport.minio_utils.async_create_and_upload_thumbnail")
    async def test_async_process_and_upload_image_success(self, mock_create_thumb, mock_upload):
        """Test successful async image processing and upload."""
        mock_upload.return_value = "/bucket/test.jpg"
        mock_create_thumb.return_value = ("test/thumbnails/test.jpg", 800, 600)

        result = await async_process_and_upload_image(b"image_bytes", "test.jpg")

        assert result == ("test.jpg", "test/thumbnails/test.jpg", 800, 600)
        assert mock_upload.call_count == 1
        assert mock_create_thumb.call_count == 1

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_upload_fileobj")
    @patch("viewport.minio_utils.async_create_and_upload_thumbnail")
    async def test_async_process_and_upload_image_thumbnail_failure(self, mock_create_thumb, mock_upload):
        """Test async image processing when thumbnail creation fails."""
        mock_upload.return_value = "/bucket/test.jpg"
        mock_create_thumb.side_effect = Exception("Thumbnail creation failed")

        result = await async_process_and_upload_image(b"image_bytes", "test.jpg")

        # Should still return success but with None dimensions and original as thumbnail
        assert result == ("test.jpg", "test.jpg", None, None)

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.async_upload_fileobj")
    async def test_async_process_and_upload_image_upload_failure(self, mock_upload):
        """Test async image processing when upload fails."""
        mock_upload.side_effect = Exception("Upload failed")

        with pytest.raises(Exception, match="Upload failed"):
            await async_process_and_upload_image(b"image_bytes", "test.jpg")

    @pytest.mark.skip(reason="MinIO bucket existence is not checked right now, because of problems with proxy.")
    @pytest.mark.asyncio
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_ensure_bucket_exists_new_bucket(self, mock_get_config, mock_get_client):
        """Test async bucket creation when bucket doesn't exist."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        await async_ensure_bucket_exists()

        mock_client.create_bucket.assert_called_once_with(Bucket="test-bucket")

    @pytest.mark.asyncio
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_ensure_bucket_exists_existing_bucket(self, mock_get_config, mock_get_client):
        """Test async bucket creation when bucket already exists."""
        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": [{"Name": "test-bucket"}]}
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        await async_ensure_bucket_exists()

        mock_client.create_bucket.assert_not_called()

    @pytest.mark.skip(reason="MinIO bucket existence is not checked right now, because of problems with proxy.")
    @pytest.mark.asyncio
    @patch("viewport.minio_utils.get_s3_client")
    @patch("viewport.minio_utils.get_minio_config")
    async def test_async_ensure_bucket_exists_bucket_creation_error(self, mock_get_config, mock_get_client):
        """Test async bucket creation when creation fails."""
        # Reset global state
        import viewport.minio_utils as minio_utils

        minio_utils._bucket_ensured = False

        mock_client = Mock()
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_client.create_bucket.side_effect = ClientError({"Error": {"Code": "InvalidBucketName"}}, "CreateBucket")
        mock_get_client.return_value = mock_client
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket", "kek", "lol")

        with pytest.raises(ClientError):
            await async_ensure_bucket_exists()
