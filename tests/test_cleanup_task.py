from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from viewport.background_tasks import cleanup_orphaned_uploads_task
from viewport.models.gallery import Gallery, Photo, PhotoUploadStatus
from viewport.models.user import User
from viewport.s3_utils import get_s3_client, get_s3_settings

if TYPE_CHECKING:
    from freezegun.api import FrozenDateTimeFactory


@pytest.mark.integration
class TestCleanupTask:
    def test_cleanup_orphaned_uploads_task(self, engine, s3_container, freezer: FrozenDateTimeFactory):
        # 0. Set initial time
        initial_time = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
        freezer.move_to(initial_time)

        # Setup: Create a user and a gallery
        with Session(engine) as session:
            user = User(email=f"cleanup-{uuid4()}@example.com", password_hash="hashed", display_name="cleanup")
            session.add(user)
            session.flush()

            gallery = Gallery(owner_id=user.id, name="Test Gallery")
            session.add(gallery)
            session.flush()

            # Capture IDs before commit
            gallery_id = gallery.id

            # 1. Create a photo that will become orphaned
            orphaned_photo = Photo(
                id=uuid4(),
                gallery_id=gallery_id,
                status=PhotoUploadStatus.PENDING,
                object_key=f"{gallery_id}/old.jpg",
                thumbnail_object_key=f"{gallery_id}/old.jpg",
                file_size=100,
            )
            session.add(orphaned_photo)

            # 1.1 Create a failed photo that should also be cleaned up
            failed_photo = Photo(
                id=uuid4(),
                gallery_id=gallery_id,
                status=PhotoUploadStatus.FAILED,
                object_key=f"{gallery_id}/failed.jpg",
                thumbnail_object_key=f"{gallery_id}/failed_thumb.jpg",
                file_size=100,
            )
            session.add(failed_photo)
            session.commit()

            orphaned_id = orphaned_photo.id
            orphaned_key = orphaned_photo.object_key
            failed_id = failed_photo.id
            failed_key = failed_photo.object_key
            failed_thumb_key = failed_photo.thumbnail_object_key

        # Upload dummy files to S3
        s3_client = get_s3_client()
        bucket = get_s3_settings().bucket
        s3_client.put_object(Bucket=bucket, Key=orphaned_key, Body=b"dummy")
        s3_client.put_object(Bucket=bucket, Key=failed_key, Body=b"dummy")
        s3_client.put_object(Bucket=bucket, Key=failed_thumb_key, Body=b"dummy")

        # 2. Verify it's NOT deleted yet if we run cleanup now (it's new)
        result = cleanup_orphaned_uploads_task()
        assert result["deleted_count"] == 0

        with Session(engine) as session:
            assert session.get(Photo, orphaned_id) is not None
            assert session.get(Photo, failed_id) is not None

        # 3. Simulate time passing (1 hour and 1 minute)
        freezer.tick(timedelta(hours=1, minutes=1))

        # 4. Create another recent PENDING photo (should NOT be deleted)
        with Session(engine) as session:
            recent_photo = Photo(
                id=uuid4(),
                gallery_id=gallery_id,
                status=PhotoUploadStatus.PENDING,
                object_key=f"{gallery_id}/recent.jpg",
                thumbnail_object_key=f"{gallery_id}/recent.jpg",
                file_size=100,
            )
            session.add(recent_photo)
            session.commit()
            recent_id = recent_photo.id
            recent_key = recent_photo.object_key

        s3_client.put_object(Bucket=bucket, Key=recent_key, Body=b"dummy")

        # 5. Run the cleanup task again
        result = cleanup_orphaned_uploads_task()
        assert result["deleted_count"] >= 2  # At least orphaned and failed

        # 6. Verify results
        with Session(engine) as session:
            # Orphaned photo should be gone
            assert session.get(Photo, orphaned_id) is None
            # Failed photo should be gone
            assert session.get(Photo, failed_id) is None
            # Recent photo should still exist
            assert session.get(Photo, recent_id) is not None

        # Verify S3 cleanup
        for key in [orphaned_key, failed_key, failed_thumb_key]:
            try:
                s3_client.head_object(Bucket=bucket, Key=key)
                pytest.fail(f"S3 object {key} should have been deleted")
            except Exception as e:
                if "404" not in str(e) and "NoSuchKey" not in str(e):
                    raise e

        # Recent S3 object should still exist
        s3_client.head_object(Bucket=bucket, Key=recent_key)
