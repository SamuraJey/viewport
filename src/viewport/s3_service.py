"""
Asynchronous S3 Client Service

This module provides an async-first S3 client that uses aioboto3 for
non-blocking S3 operations. The client is designed to be used as an application
singleton via dependency injection.
"""

import asyncio
import io
import logging
from typing import TYPE_CHECKING, BinaryIO

import aioboto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from botocore.exceptions import ClientError

from viewport.cache_utils import cache_presigned_url, get_cached_presigned_url
from viewport.s3_utils import S3Settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class AsyncS3Client:
    """Asynchronous S3 Client

    This client maintains a shared aioboto3.Session for memory efficiency.
    Uses small connection pool with aggressive connection reuse timeout
    and exponential backoff retry logic to handle transient errors under
    high concurrency without memory leaks.

    All methods are async-first and do not block the event loop.
    """

    def __init__(self):
        """Initialize the AsyncS3Client with configuration from environment."""
        self.settings = S3Settings()
        self._session: aioboto3.Session | None = None
        self._endpoint_url = self._get_endpoint_url()
        # Use aggressive connection pooling configuration:
        # - Small pool size (10 connections max)
        # - Read timeout forces connections to close after idle period
        # - Standard retries with exponential backoff for transient errors
        self._config = Config(
            signature_version=self.settings.signature_version,
            max_pool_connections=10,  # Small pool to avoid memory bloat
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=10,
            read_timeout=30,  # Shorter timeout to close idle connections faster
            s3={"addressing_style": "path"},
        )
        self._presign_client = None
        # Optimized transfer config for faster uploads:
        # - Lower threshold to start multipart sooner (5MB vs 8MB)
        # - Larger chunk size for fewer round trips (8MB)
        # - Higher concurrency for parallel part uploads
        self._transfer_config = TransferConfig(
            multipart_threshold=5 * 1024 * 1024,  # 5MB - start multipart earlier
            multipart_chunksize=8 * 1024 * 1024,  # 8MB chunks for fewer round trips
            max_concurrency=20,  # Higher concurrency for parallel part uploads
            use_threads=False,  # Use asyncio instead of threads to avoid overhead
        )
        # Small file config - skip multipart overhead for small files
        self._small_transfer_config = TransferConfig(
            multipart_threshold=50 * 1024 * 1024,  # 50MB threshold ensures small files (<5MB) never use multipart, even with overhead
            use_threads=False,
        )
        logger.info("AsyncS3Client initialized: endpoint=%s, bucket=%s, region=%s", self._endpoint_url, self.settings.bucket, self.settings.region)

    def _get_endpoint_url(self) -> str | None:
        """Get the endpoint URL with protocol if needed."""
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
        Memory is managed through connection pooling limits and timeouts.
        """
        if self._session is None:
            self._session = aioboto3.Session(
                aws_access_key_id=self.settings.access_key,
                aws_secret_access_key=self.settings.secret_key,
                region_name=self.settings.region,
            )
        return self._session

    def _get_s3_client(self) -> "S3Client":
        """Get configured S3 client context manager from shared session.

        Uses the shared session but creates a new client for each operation.
        Context manager ensures proper resource cleanup.

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
        file_size: int | None = None,
    ) -> str:
        """Upload a file object to S3.

        Args:
            file_obj: File-like object or bytes to upload
            key: S3 object key
            content_type: Optional Content-Type header (e.g., 'image/jpeg')
            metadata: Optional metadata to attach to the object
            file_size: Optional file size hint for transfer config optimization

        Returns:
            S3 object path

        Raises:
            Exception: If upload fails after retries
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

        # Choose transfer config based on file size
        # Small files (<5MB) skip multipart overhead entirely
        transfer_config = self._small_transfer_config if (file_size and file_size < 5 * 1024 * 1024) else self._transfer_config

        # Retry with exponential backoff for transient errors
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Reset file pointer for retry
                if hasattr(file_obj, "seek"):
                    file_obj.seek(0)

                async with self._get_s3_client() as s3:
                    s3: "S3Client"
                    await s3.upload_fileobj(
                        file_obj,
                        self.settings.bucket,
                        key,
                        ExtraArgs=extra_args if extra_args else None,
                        Config=transfer_config,
                    )
                logger.debug("Successfully uploaded object: %s", key)
                return f"/{self.settings.bucket}/{key}"
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")

                # Retry on transient errors (UnauthorizedAccess, ServiceUnavailable, etc.)
                is_transient = error_code in [
                    "UnauthorizedAccess",
                    "ServiceUnavailable",
                    "RequestTimeout",
                    "SlowDown",
                ]

                if is_transient and attempt < max_retries - 1:
                    wait_time = 0.5 * (2**attempt)  # Exponential backoff: 0.5s, 1s, 2s
                    logger.warning("Transient error uploading %s (attempt %s/%s): %s. Retrying in %ss...", key, attempt + 1, max_retries, e, wait_time)
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error("Failed to upload object %s: %s", key, e)
                    raise
            except Exception as e:
                logger.error("Failed to upload object %s: %s", key, e)
                raise

    async def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """Upload bytes directly to S3 - optimized for small files.

        This is faster than upload_fileobj for small files as it:
        - Avoids SpooledTemporaryFile overhead
        - Uses put_object for small files (single request)
        - Falls back to upload_fileobj for large files

        Args:
            data: Bytes to upload
            key: S3 object key
            content_type: Optional Content-Type header
            metadata: Optional metadata to attach

        Returns:
            S3 object path
        """
        file_size = len(data)

        # For small files (<5MB), use put_object directly - single request, fastest
        if file_size < 5 * 1024 * 1024:
            extra_args: dict[str, str | dict[str, str]] = {}
            if content_type:
                extra_args["ContentType"] = content_type
            if metadata:
                extra_args["Metadata"] = metadata

            try:
                async with self._get_s3_client() as s3:
                    s3: "S3Client"
                    await s3.put_object(
                        Bucket=self.settings.bucket,
                        Key=key,
                        Body=data,
                        **extra_args,
                    )
                logger.debug("Successfully uploaded object via put_object: %s", key)
                return f"/{self.settings.bucket}/{key}"
            except Exception as e:
                logger.error("Failed to upload object %s: %s", key, e)
                raise

        # For larger files, use the streaming upload
        return await self.upload_fileobj(data, key, content_type, metadata, file_size)

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
            logger.info("Successfully downloaded object: %s", key)
            return content
        except Exception as e:
            logger.error("Failed to download object %s: %s", key, e)
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
            logger.info("Successfully deleted object: %s", key)
        except Exception as e:
            logger.error("Failed to delete object %s: %s", key, e)
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
            logger.error("Failed to check if object exists %s: %s", key, e)
            raise

    async def head_object(self, key: str) -> dict:
        """Get object metadata without downloading the file

        Args:
            key: S3 object key

        Returns:
            Object metadata dict with ContentLength, ContentType, etc.

        Raises:
            ClientError: If object doesn't exist or other S3 error
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                response = await s3.head_object(Bucket=self.settings.bucket, Key=key)
            return response
        except Exception as e:
            logger.error("Failed to head object %s: %s", key, e)
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
            logger.info("Successfully renamed object from %s to %s", old_key, new_key)
        except Exception as e:
            logger.error("Failed to rename object from %s to %s: %s", old_key, new_key, e)
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
                                    logger.warning("Failed to delete object %s: %s", error["Key"], error["Message"])
                        except Exception:
                            logger.exception("Failed to delete batch of objects")
                            # Continue with next batch even if one fails

                    logger.info("Successfully deleted %d/%d objects with prefix %s", deleted_count, len(objects_to_delete), prefix)
                else:
                    logger.info("No objects found with prefix %s", prefix)
        except Exception as e:
            logger.error("Failed to delete folder with prefix %s: %s", prefix, e)
            raise

    async def close(self) -> None:
        """Close the session and clean up resources."""
        if self._session is not None:
            logger.info("Closing AsyncS3Client session")
            # aioboto3 sessions are cleaned up automatically but we can help
            self._session = None
        if self._presign_client is not None:
            self._presign_client.close()
            self._presign_client = None

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
            logger.debug("Using cached presigned URL for: %s", key)
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

            logger.debug("Generated presigned URL for: %s", key)
            return str(url)
        except Exception as e:
            logger.error("Failed to generate presigned URL for %s: %s", key, e)
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
            logger.debug("Generating %s presigned URLs, %s from cache", len(to_generate), len(urls))
        else:
            logger.debug("All %s presigned URLs from cache", len(urls))

        # Generate presigned URLs for uncached keys
        for key in to_generate:
            try:
                url = self.generate_presigned_url(key, expires_in)
                urls[key] = url
            except Exception as e:
                logger.warning("Failed to generate presigned URL for %s: %s", key, e)

        return urls

    def generate_presigned_put(
        self,
        object_key: str,
        content_type: str,
        content_length: int,
        expires_in: int = 900,  # 15 minutes
    ) -> dict[str, str | dict[str, str]]:
        """Generate presigned PUT data for direct S3 upload with enforced headers.

        Args:
            object_key: S3 key where file will be stored
            content_type: MIME type (e.g., 'image/jpeg')
            content_length: Exact file size in bytes
            expires_in: URL expiration in seconds (default: 15 minutes)

        Returns:
            Dict with 'url' and 'headers' describing the signed request

        Raises:
            Exception: If URL generation fails
        """
        try:
            presign_client = self._get_presign_client()
            tagging = "upload-status=pending"

            params = {
                "Bucket": self.settings.bucket,
                "Key": object_key,
                "ContentType": content_type,
                "ContentLength": content_length,
                "Tagging": tagging,
            }

            url = presign_client.generate_presigned_url(
                "put_object",
                Params=params,
                ExpiresIn=expires_in,
                HttpMethod="PUT",
            )

            headers = {
                "Content-Type": content_type,
                "x-amz-tagging": tagging,
                "Content-Length": str(content_length),
            }

            logger.debug("Generated presigned PUT for: %s", object_key)
            return {"url": str(url), "headers": headers}
        except Exception as e:
            logger.error("Failed to generate presigned PUT for %s: %s", object_key, e)
            raise

    async def put_object_tagging(self, key: str, tags: dict[str, str]) -> None:
        """Update object tags in S3

        Args:
            key: S3 object key
            tags: Dictionary of tag key-value pairs

        Raises:
            Exception: If tagging update fails
        """
        try:
            # Convert tags dict to S3 TagSet format
            tag_set = [{"Key": k, "Value": v} for k, v in tags.items()]

            async with self._get_s3_client() as s3:
                s3: "S3Client"
                await s3.put_object_tagging(
                    Bucket=self.settings.bucket,
                    Key=key,
                    Tagging={"TagSet": tag_set},
                )
            logger.debug("Updated tags for: %s", key)
        except Exception as e:
            logger.error("Failed to update tags for %s: %s", key, e)
            raise

    async def delete_object_tagging(self, key: str) -> None:
        """Remove all tags from S3 object

        Args:
            key: S3 object key

        Raises:
            Exception: If tagging deletion fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                await s3.delete_object_tagging(
                    Bucket=self.settings.bucket,
                    Key=key,
                )
            logger.debug("Deleted tags for: %s", key)
        except Exception as e:
            logger.error("Failed to delete tags for %s: %s", key, e)
            raise

    async def get_object_tagging(self, key: str) -> dict[str, str]:
        """Get tags from S3 object

        Args:
            key: S3 object key

        Returns:
            Dictionary of tag key-value pairs

        Raises:
            Exception: If getting tags fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                response = await s3.get_object_tagging(
                    Bucket=self.settings.bucket,
                    Key=key,
                )
            # Convert TagSet to dict
            tags = {tag["Key"]: tag["Value"] for tag in response.get("TagSet", [])}
            logger.debug("Got tags for %s: %s", key, tags)
            return tags
        except Exception as e:
            logger.error("Failed to get tags for %s: %s", key, e)
            raise

    async def copy_object_with_new_tags(self, key: str, new_tags: dict[str, str]) -> None:
        """Copy object to itself with new tags (workaround for immutable tags)

        Args:
            key: S3 object key
            new_tags: New tags to apply

        Raises:
            Exception: If copy fails
        """
        try:
            async with self._get_s3_client() as s3:
                s3: "S3Client"
                # Convert tags to URL-encoded format
                tag_string = "&".join(f"{k}={v}" for k, v in new_tags.items())

                # Copy object to itself with new tags
                await s3.copy_object(
                    Bucket=self.settings.bucket,
                    Key=key,
                    CopySource={"Bucket": self.settings.bucket, "Key": key},
                    Tagging=tag_string,
                    TaggingDirective="REPLACE",
                    MetadataDirective="COPY",
                )
            logger.info("Copied object with new tags for: %s -> %s", key, new_tags)
        except Exception as e:
            logger.error("Failed to copy object with new tags for %s: %s", key, e)
            raise

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
            logger.info("Successfully got object: %s", key)
            return response
        except Exception as e:
            logger.error("Failed to get object %s: %s", key, e)
            raise
