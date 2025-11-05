"""
Asynchronous S3 Client Service

This module provides an async-first S3/MinIO client that uses aioboto3 for
non-blocking S3 operations. The client is designed to be used as an application
singleton via dependency injection.
"""

import io
import logging
from typing import TYPE_CHECKING, BinaryIO

import aioboto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config

from viewport.cache_utils import cache_presigned_url, get_cached_presigned_url
from viewport.minio_utils import S3Settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class AsyncS3Client:
    """Asynchronous S3 Client

    This client maintains a shared aioboto3.Session that is created once and
    reused for all operations. Individual S3 clients are created per operation
    using context managers to ensure proper resource cleanup.

    All methods are async-first and do not block the event loop.
    """

    def __init__(self):
        """Initialize the AsyncS3Client with configuration from environment."""
        self.settings = S3Settings()
        self._session: aioboto3.Session | None = None
        self._endpoint_url = self._get_endpoint_url()
        self._config = Config(
            signature_version=self.settings.signature_version,
            max_pool_connections=200,  # Increased to handle more concurrent uploads
            retries={"max_attempts": 3, "mode": "standard"},  # Retry failed requests
            connect_timeout=10,  # Connection timeout in seconds
            read_timeout=60,  # Read timeout in seconds
            s3={"addressing_style": "path"},
        )
        self._presign_client = None
        self._transfer_config = TransferConfig(
            multipart_threshold=8 * 1024 * 1024,  # 8MB threshold before multipart kicks in
            multipart_chunksize=4 * 1024 * 1024,  # 4MB chunks for better performance
            max_concurrency=20,
            use_threads=True,
        )
        logger.info(f"AsyncS3Client initialized: endpoint={self._endpoint_url}, bucket={self.settings.bucket}, region={self.settings.region}")
    def _get_endpoint_url(self) -> str | None:
        """Get the endpoint URL with protocol if needed."""
        # The endpoint is already set in S3Settings, just add protocol if missing
        endpoint = self.settings.endpoint
        use_ssl = getattr(self.settings, "use_ssl", False)
        if not endpoint.startswith(("http://", "https://")):
            protocol = "https" if use_ssl else "http"
            return f"{protocol}://{endpoint}"
        return endpoint

    @property
    def session(self) -> aioboto3.Session:
        """Get or create the shared aioboto3 session.

        The session is created once and reused for all operations.
        """
        if self._session is None:
            self._session = aioboto3.Session(
                aws_access_key_id=self.settings.access_key,
                aws_secret_access_key=self.settings.secret_key,
                region_name=self.settings.region,
            )
        return self._session

    def _get_s3_client(self) -> "S3Client":
        """Get configured S3 client context manager.

        This is a helper to avoid repeating the client configuration everywhere.
        Usage: async with self._get_s3_client() as s3:
        """
        return self.session.client("s3", endpoint_url=self._endpoint_url, config=self._config)

    def _get_presign_client(self):
        import boto3

        if self._presign_client is None:
            self._presign_client = boto3.client(
                "s3",
                endpoint_url=self._endpoint_url,
                aws_access_key_id=self.settings.access_key,
                aws_secret_access_key=self.settings.secret_key,
                region_name=self.settings.region,
                config=self._config,
            )
        return self._presign_client

    async def upload_fileobj(
        self,
        file_obj: BinaryIO | bytes,
        key: str,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """Upload a file object to S3.

        Args:
            file_obj: File-like object or bytes to upload
            key: S3 object key
            content_type: Optional Content-Type header (e.g., 'image/jpeg')
            metadata: Optional metadata to attach to the object

        Returns:
            S3 object path

        Raises:
            Exception: If upload fails
        """
        # Normalize bytes to file-like object
        if isinstance(file_obj, bytes):
            file_obj = io.BytesIO(file_obj)
        else:
            # Ensure file pointer is at the beginning for streaming uploads
            if hasattr(file_obj, "seek"):
                file_obj.seek(0)

        extra_args: dict[str, str | dict[str, str]] = {}
        if content_type:
            extra_args["ContentType"] = content_type
        if metadata:
            extra_args["Metadata"] = metadata

        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                await s3.upload_fileobj(
                    file_obj,
                    self.settings.bucket,
                    key,
                    ExtraArgs=extra_args if extra_args else None,
                    Config=self._transfer_config,
                )
            logger.info(f"Successfully uploaded object: {key}")
            return f"/{self.settings.bucket}/{key}"
        except Exception as e:
            logger.error(f"Failed to upload object {key}: {e}")
            raise

    async def download_fileobj(self, key: str) -> bytes:
        """Download a file from S3.

        Args:
            key: S3 object key

        Returns:
            File contents as bytes

        Raises:
            Exception: If download fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"

                response = await s3.get_object(Bucket=self.settings.bucket, Key=key)
                # Read the body stream
                body = response.get("Body")
                if body is None:
                    raise ValueError(f"No body in response for key {key}")
                content: bytes = await body.read()
            logger.info(f"Successfully downloaded object: {key}")
            return content
        except Exception as e:
            logger.error(f"Failed to download object {key}: {e}")
            raise

    async def delete_file(self, key: str) -> None:
        """Delete a file from S3.

        Args:
            key: S3 object key

        Raises:
            Exception: If deletion fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                await s3.delete_object(Bucket=self.settings.bucket, Key=key)
            logger.info(f"Successfully deleted object: {key}")
        except Exception as e:
            logger.error(f"Failed to delete object {key}: {e}")
            raise

    async def file_exists(self, key: str) -> bool:
        """Check if a file exists in S3.

        Args:
            key: S3 object key

        Returns:
            True if file exists, False otherwise
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                await s3.head_object(Bucket=self.settings.bucket, Key=key)
            return True
        except Exception as e:
            # Check if it's a NoSuchKey error by checking the exception code
            error_code = getattr(e.response, "Error", {}).get("Code") if hasattr(e, "response") else None
            if error_code == "404" or "NoSuchKey" in str(type(e).__name__):
                return False
            logger.error(f"Failed to check if object exists {key}: {e}")
            raise

    async def rename_file(self, old_key: str, new_key: str) -> None:
        """Rename a file in S3 by copying to new key and deleting old key.

        Args:
            old_key: Current S3 object key
            new_key: New S3 object key

        Raises:
            Exception: If rename fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                # Copy object to new key
                copy_source = {"Bucket": self.settings.bucket, "Key": old_key}
                await s3.copy_object(
                    CopySource=copy_source,
                    Bucket=self.settings.bucket,
                    Key=new_key,
                )
                # Delete old object
                await s3.delete_object(Bucket=self.settings.bucket, Key=old_key)
            logger.info(f"Successfully renamed object from {old_key} to {new_key}")
        except Exception as e:
            logger.error(f"Failed to rename object from {old_key} to {new_key}: {e}")
            raise

    async def delete_folder(self, prefix: str) -> None:
        """Delete all objects with a given prefix (folder) from S3.

        Args:
            prefix: The folder prefix to delete (e.g., 'gallery_id/')

        Raises:
            Exception: If deletion fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                # List all objects with the given prefix
                objects_to_delete = []
                continuation_token = None

                while True:
                    # Build list parameters
                    list_params: dict = {
                        "Bucket": self.settings.bucket,
                        "Prefix": prefix,
                    }
                    if continuation_token:
                        list_params["ContinuationToken"] = continuation_token

                    # List objects
                    response = await s3.list_objects_v2(**list_params)

                    # Collect objects
                    if "Contents" in response:
                        objects_to_delete.extend([obj["Key"] for obj in response["Contents"]])

                    # Check if there are more pages
                    if not response.get("IsTruncated"):
                        break

                    continuation_token = response.get("NextContinuationToken")

                # Delete all objects if any were found
                if objects_to_delete:
                    deleted_count = 0
                    # Delete objects in batches (S3 API allows up to 1000 objects per delete_objects call)
                    batch_size = 1000
                    for i in range(0, len(objects_to_delete), batch_size):
                        batch = objects_to_delete[i : i + batch_size]
                        try:
                            # Prepare delete request for batch
                            delete_request = {"Objects": [{"Key": key} for key in batch]}
                            response = await s3.delete_objects(Bucket=self.settings.bucket, Delete=delete_request)

                            # Count successfully deleted objects
                            if "Deleted" in response:
                                deleted_count += len(response["Deleted"])

                            # Log any errors that occurred during batch delete
                            if "Errors" in response:
                                for error in response["Errors"]:
                                    logger.warning(f"Failed to delete object {error['Key']}: {error['Message']}")
                        except Exception:
                            logger.exception("Failed to delete batch of objects")
                            # Continue with next batch even if one fails

                    logger.info(f"Successfully deleted {deleted_count}/{len(objects_to_delete)} objects with prefix {prefix}")
                else:
                    logger.info(f"No objects found with prefix {prefix}")
        except Exception as e:
            logger.error(f"Failed to delete folder with prefix {prefix}: {e}")
            raise

    async def close(self) -> None:
        """Close the session and clean up resources."""
        if self._session is not None:
            logger.info("Closing AsyncS3Client session")
            # Note: aioboto3 sessions don't need explicit closing in newer versions
            self._session = None

    def generate_presigned_url(self, key: str, expires_in: int = 7200) -> str:
        """Generate a presigned URL for direct S3 access to an object.

        Args:
            key: S3 object key
            expires_in: URL expiration time in seconds (default: 2 hours)

        Returns:
            Presigned URL string

        Raises:
            Exception: If URL generation fails
        """
        # Check cache first
        cached = get_cached_presigned_url(key)
        if cached:
            logger.debug(f"Using cached presigned URL for: {key}")
            return cached

        try:
            # Create a sync boto3 client for presigned URL generation
            # (presigned URLs are sync operation, no need for async)
            s3_client = self._get_presign_client()
            url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.settings.bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            # Cache the presigned URL (with some buffer inside cache function)
            try:
                cache_presigned_url(key, str(url), expires_in)
            except Exception:
                logger.warning("Failed to cache presigned URL for key %s", key)

            logger.info(f"Generated presigned URL for: {key}")
            return str(url)
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for {key}: {e}")
            raise

    async def generate_presigned_urls_batch(self, keys: list[str], expires_in: int = 7200) -> dict[str, str]:
        """Generate presigned URLs for multiple objects concurrently.

        Args:
            keys: List of S3 object keys
            expires_in: URL expiration time in seconds (default: 2 hours)

        Returns:
            Dict mapping object_key to presigned URL

        Raises:
            Exception: If URL generation fails
        """
        urls: dict[str, str] = {}

        # First consult cache to skip already cached keys
        to_generate: list[str] = []
        for key in keys:
            cached = get_cached_presigned_url(key)
            if cached:
                urls[key] = cached
            else:
                to_generate.append(key)

        if to_generate:
            logger.debug(f"Generating {len(to_generate)} presigned URLs, {len(urls)} from cache")
        else:
            logger.debug(f"All {len(urls)} presigned URLs from cache")

        # Generate presigned URLs for uncached keys
        for key in to_generate:
            try:
                url = self.generate_presigned_url(key, expires_in)
                urls[key] = url
            except Exception as e:
                logger.warning(f"Failed to generate presigned URL for {key}: {e}")

        return urls

    async def get_object(self, key: str) -> dict:
        """Get an object from S3.

        Args:
            key: S3 object key

        Returns:
            S3 get_object response dict

        Raises:
            Exception: If get fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                response = await s3.get_object(Bucket=self.settings.bucket, Key=key)
            logger.info(f"Successfully got object: {key}")
            return response
        except Exception as e:
            logger.error(f"Failed to get object {key}: {e}")
            raise
