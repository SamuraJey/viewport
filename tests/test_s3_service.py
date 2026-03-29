"""
Tests for AsyncS3Client

This module contains unit and integration tests for the AsyncS3Client service.
Tests use mocking for unit tests. Each test mocks _get_s3_client() to provide
fresh context managers for async operations, reflecting the per-operation session
creation strategy used by AsyncS3Client.
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from viewport.s3_service import AsyncS3Client


@pytest.fixture
def mock_settings():
    """Create mock S3Settings for testing."""
    settings = MagicMock()
    settings.access_key = "test-access-key"
    settings.secret_key = "test-secret-key"
    settings.bucket = "test-bucket"
    settings.region = "us-east-1"
    settings.endpoint = "localhost:9000"
    return settings


@pytest.fixture
def s3_client(mock_settings):
    """Create an AsyncS3Client instance with mocked settings.

    The client is configured with test settings but actual S3 operations
    are mocked in individual tests.
    """
    with patch("viewport.s3_service.S3Settings", return_value=mock_settings):
        client = AsyncS3Client()
        return client


class TestAsyncS3ClientInit:
    """Tests for AsyncS3Client initialization."""

    def test_client_initialization(self, s3_client):
        """Test that the client initializes with correct settings."""
        assert s3_client.settings is not None
        assert s3_client.settings.bucket == "test-bucket"
        assert s3_client.settings.region == "us-east-1"

    def test_session_property_creates_session_once(self, s3_client):
        """Test that the session property creates a session once and reuses it."""
        session1 = s3_client.session
        session2 = s3_client.session
        assert session1 is session2  # Shared session for memory efficiency


class TestAsyncS3ClientUploadFileobj:
    """Tests for upload_fileobj method."""

    @pytest.mark.asyncio
    async def test_upload_fileobj_with_file_like_object(self, s3_client):
        """Test uploading a file-like object."""
        file_content = b"test file content"
        file_obj = io.BytesIO(file_content)

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_fileobj(file_obj, "test-key.txt")

        assert result == "/test-bucket/test-key.txt"
        mock_s3_client.upload_fileobj.assert_called_once()

    @pytest.mark.asyncio
    async def test_upload_fileobj_with_bytes(self, s3_client):
        """Test uploading raw bytes."""
        file_content = b"test file content"

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_fileobj(file_content, "test-key.txt")

        assert result == "/test-bucket/test-key.txt"
        mock_s3_client.upload_fileobj.assert_called_once()

    @pytest.mark.asyncio
    async def test_upload_fileobj_with_content_type(self, s3_client):
        """Test uploading with content type."""
        file_content = b"test image content"

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_fileobj(file_content, "test-image.jpg", content_type="image/jpeg")

        assert result == "/test-bucket/test-image.jpg"
        # Verify that content type was passed in extra args
        call_args = mock_s3_client.upload_fileobj.call_args
        extra_args = call_args.kwargs.get("ExtraArgs") if call_args.kwargs else call_args[0][3]
        assert extra_args.get("ContentType") == "image/jpeg"

    @pytest.mark.asyncio
    async def test_upload_fileobj_raises_on_error(self, s3_client):
        """Test that upload raises exception on error."""
        file_content = b"test file content"

        mock_s3_client = AsyncMock()
        mock_s3_client.upload_fileobj.side_effect = Exception("Upload failed")
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Upload failed"):  # noqa: B017
            await s3_client.upload_fileobj(file_content, "test-key.txt")


class TestAsyncS3ClientUploadBytes:
    """Tests for upload_bytes method."""

    @pytest.mark.asyncio
    async def test_upload_bytes_small_file_uses_put_object(self, s3_client):
        """Test that small files (<5MB) use put_object directly."""
        # Create a small file (1MB)
        file_content = b"x" * (1 * 1024 * 1024)

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(file_content, "small-file.bin")

        assert result == "/test-bucket/small-file.bin"
        # Verify put_object was called, not upload_fileobj
        mock_s3_client.put_object.assert_called_once()
        mock_s3_client.upload_fileobj.assert_not_called()

    @pytest.mark.asyncio
    async def test_upload_bytes_large_file_uses_upload_fileobj(self, s3_client):
        """Test that large files (≥5MB) fall back to upload_fileobj."""
        # Create a large file (6MB)
        file_content = b"x" * (6 * 1024 * 1024)

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(file_content, "large-file.bin")

        assert result == "/test-bucket/large-file.bin"
        # Verify upload_fileobj was called, not put_object
        mock_s3_client.upload_fileobj.assert_called_once()
        mock_s3_client.put_object.assert_not_called()

    @pytest.mark.asyncio
    async def test_upload_bytes_with_content_type(self, s3_client):
        """Test uploading small file with content type."""
        file_content = b"test image content"

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(file_content, "test-image.jpg", content_type="image/jpeg")

        assert result == "/test-bucket/test-image.jpg"
        # Verify that content type was passed
        call_args = mock_s3_client.put_object.call_args
        assert call_args.kwargs.get("ContentType") == "image/jpeg"

    @pytest.mark.asyncio
    async def test_upload_bytes_with_metadata(self, s3_client):
        """Test uploading small file with metadata."""
        file_content = b"test file content"
        metadata = {"user-id": "123", "upload-time": "2024-01-01"}

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(file_content, "test-file.txt", metadata=metadata)

        assert result == "/test-bucket/test-file.txt"
        # Verify that metadata was passed
        call_args = mock_s3_client.put_object.call_args
        assert call_args.kwargs.get("Metadata") == metadata

    @pytest.mark.asyncio
    async def test_upload_bytes_with_content_type_and_metadata(self, s3_client):
        """Test uploading small file with both content type and metadata."""
        file_content = b"test image content"
        metadata = {"user-id": "456"}

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(
            file_content,
            "test-image.png",
            content_type="image/png",
            metadata=metadata,
        )

        assert result == "/test-bucket/test-image.png"
        # Verify both content type and metadata were passed
        call_args = mock_s3_client.put_object.call_args
        assert call_args.kwargs.get("ContentType") == "image/png"
        assert call_args.kwargs.get("Metadata") == metadata

    @pytest.mark.asyncio
    async def test_upload_bytes_raises_on_error(self, s3_client):
        """Test that upload_bytes raises exception on error."""
        file_content = b"test file content"

        mock_s3_client = AsyncMock()
        mock_s3_client.put_object.side_effect = Exception("Upload failed")
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        # Test that exceptions are propagated (consistent with existing test patterns)
        with pytest.raises(Exception, match="Upload failed"):  # noqa: B017
            await s3_client.upload_bytes(file_content, "test-key.txt")

    @pytest.mark.asyncio
    async def test_upload_bytes_at_5mb_boundary(self, s3_client):
        """Test behavior at exactly 5MB boundary."""
        # Create file at exactly 5MB (should use upload_fileobj since condition is < 5MB)
        file_content = b"x" * (5 * 1024 * 1024)

        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_bytes(file_content, "5mb-file.bin")

        assert result == "/test-bucket/5mb-file.bin"
        # At exactly 5MB, the check "< 5MB" is False, so uses upload_fileobj
        mock_s3_client.upload_fileobj.assert_called_once()
        mock_s3_client.put_object.assert_not_called()


class TestAsyncS3ClientDownloadFileobj:
    """Tests for download_fileobj method."""

    @pytest.mark.asyncio
    async def test_download_fileobj(self, s3_client):
        """Test downloading a file."""
        file_content = b"test file content"

        mock_body = AsyncMock()
        mock_body.read = AsyncMock(return_value=file_content)

        mock_s3_client = AsyncMock()
        mock_s3_client.get_object = AsyncMock(return_value={"Body": mock_body})
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.download_fileobj("test-key.txt")

        assert result == file_content
        mock_s3_client.get_object.assert_called_once_with(Bucket="test-bucket", Key="test-key.txt")

    @pytest.mark.asyncio
    async def test_download_fileobj_raises_on_no_body(self, s3_client):
        """Test that download raises exception when body is None."""
        mock_s3_client = AsyncMock()
        mock_s3_client.get_object = AsyncMock(return_value={"Body": None})
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(ValueError, match="No body in response"):
            await s3_client.download_fileobj("test-key.txt")

    @pytest.mark.asyncio
    async def test_download_fileobj_raises_on_error(self, s3_client):
        """Test that download raises exception on error."""
        mock_s3_client = AsyncMock()
        mock_s3_client.get_object.side_effect = Exception("Download failed")  # noqa: B017
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Download failed"):  # noqa: B017
            await s3_client.download_fileobj("test-key.txt")


class TestAsyncS3ClientDeleteFile:
    """Tests for delete_file method."""

    @pytest.mark.asyncio
    async def test_delete_file(self, s3_client):
        """Test deleting a file."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        await s3_client.delete_file("test-key.txt")

        mock_s3_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="test-key.txt")

    @pytest.mark.asyncio
    async def test_delete_file_raises_on_error(self, s3_client):
        """Test that delete raises exception on error."""
        mock_s3_client = AsyncMock()
        mock_s3_client.delete_object.side_effect = Exception("Delete failed")  # noqa: B017
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Delete failed"):  # noqa: B017
            await s3_client.delete_file("test-key.txt")


class TestAsyncS3ClientFileExists:
    """Tests for file_exists method."""

    @pytest.mark.asyncio
    async def test_file_exists_returns_true(self, s3_client):
        """Test that file_exists returns True when file exists."""
        mock_s3_client = AsyncMock()
        mock_s3_client.head_object = AsyncMock(return_value={"ContentLength": 100})
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.file_exists("test-key.txt")

        assert result is True
        mock_s3_client.head_object.assert_called_once_with(Bucket="test-bucket", Key="test-key.txt")

    @pytest.mark.asyncio
    async def test_file_exists_raises_on_error(self, s3_client):
        """Test that file_exists raises exception on other errors."""
        mock_s3_client = AsyncMock()
        mock_s3_client.head_object.side_effect = Exception("Connection error")  # noqa: B017
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Connection error"):  # noqa: B017
            await s3_client.file_exists("test-key.txt")


class TestAsyncS3ClientRenameFile:
    """Tests for rename_file method."""

    @pytest.mark.asyncio
    async def test_rename_file(self, s3_client):
        """Test renaming a file."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        await s3_client.rename_file("old-key.txt", "new-key.txt")

        # Verify copy was called
        mock_s3_client.copy_object.assert_called_once_with(
            CopySource={"Bucket": "test-bucket", "Key": "old-key.txt"},
            Bucket="test-bucket",
            Key="new-key.txt",
        )
        # Verify delete was called
        mock_s3_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="old-key.txt")

    @pytest.mark.asyncio
    async def test_rename_file_raises_on_error(self, s3_client):
        """Test that rename raises exception on error."""
        mock_s3_client = AsyncMock()
        mock_s3_client.copy_object.side_effect = Exception("Rename failed")  # noqa: B017
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Rename failed"):  # noqa: B017
            await s3_client.rename_file("old-key.txt", "new-key.txt")


class TestAsyncS3ClientRetryLogic:  # TODO REMOVE
    """Tests for retry logic on transient errors."""

    @pytest.mark.asyncio
    async def test_upload_retries_on_unauthorized_access(self, s3_client):
        """Test that upload retries on UnauthorizedAccess error."""
        from botocore.exceptions import ClientError

        file_content = b"test file content"

        # First call fails with UnauthorizedAccess, second succeeds
        mock_s3_client = AsyncMock()
        error_response = {"Error": {"Code": "UnauthorizedAccess"}}
        mock_s3_client.upload_fileobj.side_effect = [
            ClientError(error_response, "PutObject"),
            None,  # Success on retry
        ]

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        result = await s3_client.upload_fileobj(file_content, "test-key.txt")

        assert result == "/test-bucket/test-key.txt"
        # Should be called twice (once fails, once succeeds)
        assert mock_s3_client.upload_fileobj.call_count == 2

    @pytest.mark.asyncio
    async def test_upload_fails_after_max_retries(self, s3_client):
        """Test that upload fails after max retries."""
        from botocore.exceptions import ClientError

        file_content = b"test file content"

        mock_s3_client = AsyncMock()
        error_response = {"Error": {"Code": "UnauthorizedAccess"}}
        # All attempts fail
        mock_s3_client.upload_fileobj.side_effect = ClientError(error_response, "PutObject")

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(ClientError):
            await s3_client.upload_fileobj(file_content, "test-key.txt")

        # Should be called 3 times (max retries)
        assert mock_s3_client.upload_fileobj.call_count == 3

    @pytest.mark.asyncio
    async def test_upload_does_not_retry_non_transient_errors(self, s3_client):
        """Test that upload does not retry on non-transient errors."""
        file_content = b"test file content"

        mock_s3_client = AsyncMock()
        mock_s3_client.upload_fileobj.side_effect = Exception("Invalid bucket")

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None

        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with pytest.raises(Exception, match="Invalid bucket"):
            await s3_client.upload_fileobj(file_content, "test-key.txt")

        # Should only be called once (no retry for non-transient error)
        assert mock_s3_client.upload_fileobj.call_count == 1


class TestAsyncS3ClientClose:
    """Tests for close method."""

    @pytest.mark.asyncio
    async def test_close(self, s3_client):
        """Test that close sets session to None."""
        s3_client._session = MagicMock()
        mock_presign = MagicMock()
        s3_client._presign_client = mock_presign

        await s3_client.close()

        assert s3_client._session is None
        mock_presign.close.assert_called_once()
        assert s3_client._presign_client is None


class TestPresignedURLCaching:
    """Tests for presigned URL caching and exception handling."""

    @pytest.mark.asyncio
    async def test_generate_presigned_url_cache_hit_logging(self, s3_client):
        """Test that cache hit logs debug message (lines 500-501)."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None
        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_url") as mock_get_cached,
            patch("viewport.s3_service.logger") as mock_logger,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached.return_value = "https://cached-url.example.com"

            result = await s3_client.generate_presigned_url("test-key.jpg")

            assert result == "https://cached-url.example.com"
            mock_logger.debug.assert_any_call("Using cached presigned URL for: %s", "test-key.jpg")
            mock_get_cached.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_presigned_url_cache_read_exception_handling(self, s3_client):
        """Test that cache read exceptions are caught and logged (lines 502-503)."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None
        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_url") as mock_get_cached,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_url_sync", return_value="https://new-url.example.com"),
            patch("viewport.s3_service.cache_presigned_url") as _mock_cache_url,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached.side_effect = Exception("Redis connection failed")

            result = await s3_client.generate_presigned_url("test-key.jpg")

            assert result == "https://new-url.example.com"
            mock_logger.warning.assert_any_call(
                "Failed to read presigned URL cache for key %s: %s",
                "test-key.jpg",
                mock_get_cached.side_effect,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_url_cache_write_exception_handling(self, s3_client):
        """Test that cache write exceptions are caught and logged (lines 514-515)."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None
        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_url") as mock_get_cached,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_url_sync", return_value="https://new-url.example.com"),
            patch("viewport.s3_service.cache_presigned_url") as mock_cache_url,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached.return_value = None
            cache_error = Exception("Redis write failed")
            mock_cache_url.side_effect = cache_error

            result = await s3_client.generate_presigned_url("test-key.jpg")

            assert result == "https://new-url.example.com"
            mock_logger.warning.assert_any_call(
                "Failed to cache presigned URL for key %s: %s",
                "test-key.jpg",
                cache_error,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_url_generation_exception(self, s3_client):
        """Test that URL generation exceptions are logged and re-raised (lines 519-521)."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None
        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_url") as mock_get_cached,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_url_sync") as mock_generate,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached.return_value = None
            generation_error = Exception("S3 presign failed")
            mock_generate.side_effect = generation_error

            with pytest.raises(Exception) as exc_info:
                await s3_client.generate_presigned_url("test-key.jpg")

            assert exc_info.value == generation_error
            mock_logger.error.assert_any_call(
                "Failed to generate presigned URL for %s: %s",
                "test-key.jpg",
                generation_error,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_urls_batch_cache_read_exception(self, s3_client):
        """Test batch URL cache read exception handling (lines 588-589)."""
        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_urls_batch") as mock_get_cached_batch,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_urls_sync") as mock_generate_batch,
            patch("viewport.s3_service.cache_presigned_urls_batch") as _mock_cache_batch,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            cache_error = Exception("Redis batch read failed")
            mock_get_cached_batch.side_effect = cache_error
            mock_generate_batch.return_value = {
                "key1.jpg": "https://url1.example.com",
                "key2.jpg": "https://url2.example.com",
            }

            result = await s3_client.generate_presigned_urls_batch(["key1.jpg", "key2.jpg"])

            assert len(result) == 2
            assert "key1.jpg" in result
            assert "key2.jpg" in result
            mock_logger.warning.assert_any_call(
                "Failed to read presigned URL batch cache: %s",
                cache_error,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_urls_batch_cache_write_exception(self, s3_client):
        """Test batch URL cache write exception handling (lines 613-614)."""
        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_urls_batch") as mock_get_cached_batch,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_urls_sync") as mock_generate_batch,
            patch("viewport.s3_service.cache_presigned_urls_batch") as _mock_cache_batch,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached_batch.return_value = {}
            mock_generate_batch.return_value = {
                "key1.jpg": "https://url1.example.com",
                "key2.jpg": "https://url2.example.com",
            }
            cache_error = Exception("Redis batch write failed")
            _mock_cache_batch.side_effect = cache_error

            result = await s3_client.generate_presigned_urls_batch(["key1.jpg", "key2.jpg"])

            assert len(result) == 2
            mock_logger.warning.assert_any_call(
                "Failed to write presigned URL batch cache: %s",
                cache_error,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_urls_batch_for_dispositions_cache_read_exception(self, s3_client):
        """Test disposition-specific batch cache read exception handling (lines 635-636)."""
        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_urls_batch") as mock_get_cached_batch,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_urls_with_dispositions_sync") as mock_generate,
            patch("viewport.s3_service.cache_presigned_urls_batch") as _mock_cache_batch,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            cache_error = Exception("Redis disposition batch read failed")
            mock_get_cached_batch.side_effect = cache_error
            mock_generate.return_value = {
                "photo1.jpg": "https://url1.example.com",
                "photo2.jpg": "https://url2.example.com",
            }

            key_dispositions = {
                "photo1.jpg": "attachment; filename=photo1.jpg",
                "photo2.jpg": "attachment; filename=photo2.jpg",
            }
            result = await s3_client.generate_presigned_urls_batch_for_dispositions(key_dispositions)

            assert len(result) == 2
            mock_logger.warning.assert_any_call(
                "Failed to read presigned URL batch cache: %s",
                cache_error,
            )

    @pytest.mark.asyncio
    async def test_generate_presigned_urls_batch_for_dispositions_cache_write_exception(self, s3_client):
        """Test disposition-specific batch cache write exception handling (lines 666-667)."""
        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.get_cached_presigned_urls_batch") as mock_get_cached_batch,
            patch("viewport.s3_service.logger") as mock_logger,
            patch.object(s3_client, "_generate_presigned_urls_with_dispositions_sync") as mock_generate,
            patch("viewport.s3_service.cache_presigned_urls_batch") as _mock_cache_batch,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            mock_get_cached_batch.return_value = {}
            mock_generate.return_value = {
                "photo1.jpg": "https://url1.example.com",
                "photo2.jpg": "https://url2.example.com",
            }
            cache_error = Exception("Redis disposition batch write failed")
            _mock_cache_batch.side_effect = cache_error

            key_dispositions = {
                "photo1.jpg": "attachment; filename=photo1.jpg",
                "photo2.jpg": "attachment; filename=photo2.jpg",
            }
            result = await s3_client.generate_presigned_urls_batch_for_dispositions(key_dispositions)

            assert len(result) == 2
            mock_logger.warning.assert_any_call(
                "Failed to write presigned URL batch cache: %s",
                cache_error,
            )

    @pytest.mark.asyncio
    async def test_clear_presigned_cache_for_object_keys_exception_handling(self, s3_client):
        """Test exception handling in clear_presigned_cache_for_object_keys (lines 675-676)."""
        with (
            patch("viewport.s3_service.get_redis_client_instance") as mock_redis_getter,
            patch("viewport.s3_service.clear_presigned_urls_for_object_keys") as mock_clear,
            patch("viewport.s3_service.logger") as mock_logger,
        ):
            mock_redis = AsyncMock()
            mock_redis_getter.return_value = mock_redis
            clear_error = Exception("Redis clear failed")
            mock_clear.side_effect = clear_error

            await s3_client.clear_presigned_cache_for_object_keys(["key1.jpg", "key2.jpg"])

            mock_logger.warning.assert_any_call(
                "Failed to clear presigned URL cache for object keys: %s",
                clear_error,
            )

    @pytest.mark.asyncio
    async def test_list_object_keys_initialization(self, s3_client):
        """Test list_object_keys initializes empty list (line 680)."""
        mock_s3_client = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_s3_client
        mock_context.__aexit__.return_value = None
        s3_client._get_s3_client = MagicMock(return_value=mock_context)

        mock_s3_client.list_objects_v2.return_value = {
            "Contents": [
                {"Key": "prefix/photo1.jpg"},
                {"Key": "prefix/photo2.jpg"},
            ],
            "IsTruncated": False,
        }

        result = await s3_client.list_object_keys("prefix/")

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0] == "prefix/photo1.jpg"
        assert result[1] == "prefix/photo2.jpg"
