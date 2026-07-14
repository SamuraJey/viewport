import os
from datetime import UTC, datetime

from viewport import background_tasks
from viewport.background_tasks import cleanup_video_temp_files_task
from viewport.celery_app import CelerySettings, create_celery_app


def test_cleanup_video_temp_files_deletes_only_stale_regular_files(tmp_path, monkeypatch):
    monkeypatch.setattr(background_tasks, "VIDEO_TEMP_DIR", str(tmp_path))
    now = datetime.now(UTC).timestamp()
    old_file = tmp_path / "old.mp4"
    recent_file = tmp_path / "recent.png"
    old_file.write_bytes(b"old")
    recent_file.write_bytes(b"recent")
    os.utime(old_file, (now - background_tasks.VIDEO_TEMP_MAX_AGE_SECONDS - 1, now - background_tasks.VIDEO_TEMP_MAX_AGE_SECONDS - 1))
    os.utime(recent_file, (now, now))
    (tmp_path / "old-directory").mkdir()

    result = cleanup_video_temp_files_task.run()

    assert result == {"deleted_count": 1, "failed_count": 0}
    assert not old_file.exists()
    assert recent_file.exists()
    assert (tmp_path / "old-directory").exists()


def test_cleanup_video_temp_files_handles_missing_directory(tmp_path, monkeypatch):
    missing_dir = tmp_path / "missing"
    monkeypatch.setattr(background_tasks, "VIDEO_TEMP_DIR", str(missing_dir))

    assert cleanup_video_temp_files_task.run() == {"deleted_count": 0, "failed_count": 0}


def test_video_temp_cleanup_is_scheduled_on_video_queue():
    app = create_celery_app(
        CelerySettings(
            CELERY_BROKER_URL="memory://",
            CELERY_RESULT_BACKEND="cache+memory://",
        )
    )

    assert app.conf.task_routes["cleanup_video_temp_files"] == {"queue": "video"}
    assert app.conf.beat_schedule["cleanup-video-temp-files-every-hour"]["task"] == "cleanup_video_temp_files"
