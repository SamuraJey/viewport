"""Tests for files API module."""

import io
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from src.viewport.api.files import proxy_file


class TestFilesAPI:
    """Test file proxy API endpoint."""

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_success(self, mock_get_config, mock_get_client):
        """Test successful file proxy."""
        # Mock configuration
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        # Mock S3 client and object
        mock_client = Mock()
        mock_object = {"Body": io.BytesIO(b"fake image content"), "ContentType": "image/jpeg"}
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        # Test the endpoint
        response = proxy_file("test-image.jpg")

        # Verify S3 client was called correctly
        mock_client.get_object.assert_called_once_with(Bucket="test-bucket", Key="test-image.jpg")

        # Verify response
        assert isinstance(response, StreamingResponse)
        assert response.media_type == "image/jpeg"

    @pytest.mark.parametrize(
        "filename,expected_mime",
        [
            ("test.jpg", "image/jpeg"),
            ("test.png", "image/png"),
            ("test.pdf", "application/pdf"),
            ("test.txt", "text/plain"),
            ("test.mp4", "video/mp4"),
            ("test.unknown", "application/octet-stream"),  # fallback
        ],
    )
    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_mime_type_detection(self, mock_get_config, mock_get_client, filename, expected_mime):
        """Test MIME type detection for different file extensions."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {
            "Body": io.BytesIO(b"content"),
            "ContentType": "application/octet-stream",  # Default S3 content type
        }
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        response = proxy_file(filename)

        assert isinstance(response, StreamingResponse)
        assert response.media_type == expected_mime

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_uses_s3_content_type_fallback(self, mock_get_config, mock_get_client):
        """Test fallback to S3 object ContentType when extension unknown."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {"Body": io.BytesIO(b"content"), "ContentType": "custom/type"}
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        # File with no extension
        response = proxy_file("unknown_file")

        assert response.media_type == "custom/type"

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_final_fallback_mime_type(self, mock_get_config, mock_get_client):
        """Test final fallback to octet-stream when no ContentType."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {
            "Body": io.BytesIO(b"content")
            # No ContentType field
        }
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        response = proxy_file("unknown_file")

        assert response.media_type == "application/octet-stream"

    @pytest.mark.parametrize(
        "file_key",
        [
            "simple.jpg",
            "folder/subfolder/file.png",
            "深度/测试.txt",
            "file with spaces.pdf",
            "file-with-dashes.jpg",
            "file_with_underscores.png",
        ],
    )
    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_different_key_patterns(self, mock_get_config, mock_get_client, file_key):
        """Test file proxy with different key patterns."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {"Body": io.BytesIO(b"content"), "ContentType": "application/octet-stream"}
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        response = proxy_file(file_key)

        # Verify the key was passed correctly
        mock_client.get_object.assert_called_once_with(Bucket="test-bucket", Key=file_key)
        assert isinstance(response, StreamingResponse)

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_not_found(self, mock_get_config, mock_get_client):
        """Test file proxy when file not found."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_client.get_object.side_effect = ClientError({"Error": {"Code": "NoSuchKey", "Message": "The specified key does not exist."}}, "GetObject")
        mock_get_client.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            proxy_file("nonexistent.jpg")

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "File not found"

    @pytest.mark.parametrize(
        "error_code,error_message",
        [
            ("AccessDenied", "Access denied"),
            ("InvalidBucketName", "Invalid bucket name"),
            ("InternalError", "Internal server error"),
            ("NetworkingError", "Network error"),
        ],
    )
    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_various_s3_errors(self, mock_get_config, mock_get_client, error_code, error_message):
        """Test file proxy with various S3 errors."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_client.get_object.side_effect = ClientError({"Error": {"Code": error_code, "Message": error_message}}, "GetObject")
        mock_get_client.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            proxy_file("test.jpg")

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "File not found"

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_generic_exception(self, mock_get_config, mock_get_client):
        """Test file proxy with generic exception."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_client.get_object.side_effect = Exception("Generic error")
        mock_get_client.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            proxy_file("test.jpg")

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "File not found"

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_large_file_stream(self, mock_get_config, mock_get_client):
        """Test file proxy with large file stream."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        # Simulate a large file
        large_content = b"x" * 1024 * 1024  # 1MB
        mock_client = Mock()
        mock_object = {"Body": io.BytesIO(large_content), "ContentType": "video/mp4"}
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        response = proxy_file("large_video.mp4")

        assert isinstance(response, StreamingResponse)
        assert response.media_type == "video/mp4"

    @patch("src.viewport.api.files.logging")
    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_logging(self, mock_get_config, mock_get_client, mock_logging):
        """Test that file proxy logs appropriately."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {"Body": io.BytesIO(b"content"), "ContentType": "image/jpeg"}
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        proxy_file("test.jpg")

        # Verify logging calls
        assert mock_logging.info.call_count >= 2

        # Check specific log messages
        log_calls = [call[0][0] for call in mock_logging.info.call_args_list]
        assert any("Received request for key: test.jpg" in call for call in log_calls)
        assert any("Successfully fetched object from S3" in call for call in log_calls)

    @patch("src.viewport.api.files.logging")
    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_error_logging(self, mock_get_config, mock_get_client, mock_logging):
        """Test that file proxy logs errors appropriately."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_client.get_object.side_effect = Exception("Test error")
        mock_get_client.return_value = mock_client

        with pytest.raises(HTTPException):
            proxy_file("test.jpg")

        # Verify error logging
        mock_logging.error.assert_called_once()
        error_call = mock_logging.error.call_args[0][0]
        assert "Error fetching object" in error_call

    @patch("src.viewport.api.files.get_s3_client")
    @patch("src.viewport.api.files.get_minio_config")
    def test_proxy_file_empty_file(self, mock_get_config, mock_get_client):
        """Test file proxy with empty file."""
        mock_get_config.return_value = ("endpoint", "access", "secret", "test-bucket")

        mock_client = Mock()
        mock_object = {
            "Body": io.BytesIO(b""),  # Empty content
            "ContentType": "text/plain",
        }
        mock_client.get_object.return_value = mock_object
        mock_get_client.return_value = mock_client

        response = proxy_file("empty.txt")

        assert isinstance(response, StreamingResponse)
        assert response.media_type == "text/plain"
