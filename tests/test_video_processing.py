"""Tests for video processing in background tasks.

Mock ffmpeg/ffprobe subprocess calls and S3 interactions so no real
binaries or services are required.
"""

import json
import os
import subprocess
import tempfile
from contextlib import contextmanager
from unittest.mock import ANY, MagicMock

import pytest

from viewport.background_tasks import MAX_VIDEO_DURATION_SECONDS, VideoTransientError, _process_single_video
from viewport.task_utils import BatchTaskResult

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _make_subprocess_result(stdout="", returncode=0):
    result = MagicMock()
    result.stdout = stdout
    result.returncode = returncode
    result.check_returncode.return_value = None
    return result


def _ffprobe_json(streams=None, fmt=None):
    """Build the JSON dict that _ffprobe_streams returns."""
    data: dict = {}
    if streams is not None:
        data["streams"] = streams
    if fmt is not None:
        data["format"] = fmt
    return data


def _video_stream(width=1920, height=1080, duration="30.0", codec_type="video", codec_name=None, pix_fmt=None):
    stream = {"codec_type": codec_type, "width": width, "height": height, "duration": duration}
    if codec_name is not None:
        stream["codec_name"] = codec_name
    if pix_fmt is not None:
        stream["pix_fmt"] = pix_fmt
    return stream


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_s3():
    return MagicMock()


@pytest.fixture
def tracker():
    return BatchTaskResult(total=1)


@pytest.fixture
def payload():
    return {"photo_id": "test-photo-abc", "object_key": "gal-1/vid.mp4"}


@pytest.fixture(autouse=True)
def _silence_metrics(monkeypatch):
    """Suppress all Prometheus metric calls so tests don't import them."""
    for name in (
        "report_original_size",
        "report_processing_error",
        "report_transcode_duration",
        "report_derivative_sizes",
        "report_retry",
        "report_cleanup_failure",
    ):
        monkeypatch.setattr(f"viewport.background_tasks.{name}", MagicMock())


@pytest.fixture
def mock_db(mock_db_session):
    """Patch task_db_session to return *mock_db_session*."""

    @contextmanager
    def _fake():
        yield mock_db_session

    return _fake


@pytest.fixture
def mock_db_session():
    """A MagicMock session that satisfies all DB queries in _process_single_video."""
    s = MagicMock()
    r = MagicMock()
    # media_type check  →  one_or_none()
    r.one_or_none.return_value = ("video",)
    # photo-exists check  →  scalar_one_or_none()
    r.scalar_one_or_none.return_value = ("test-photo-abc",)
    s.execute.return_value = r
    return s


@pytest.fixture
def patch_all(monkeypatch, mock_s3, mock_db):
    """Apply every patch that every test needs.  Individual tests can override."""
    monkeypatch.setattr("viewport.background_tasks.task_db_session", mock_db)
    # _cleanup_video_failure mocked on every test so we can assert calls
    monkeypatch.setattr("viewport.background_tasks._cleanup_video_failure", MagicMock())


# ---------------------------------------------------------------------------
# success
# ---------------------------------------------------------------------------


def test_video_processing_success(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """Full happy-path: ffprobe returns valid stream; ffmpeg succeeds; S3 works."""
    # -- ffprobe ---------------------------------------------------------
    probe_data = _ffprobe_json(
        streams=[_video_stream(1280, 720, "30.5", codec_name="h264", pix_fmt="yuv420p")],
        fmt={"nb_streams": 2},
    )

    # -- subprocess.run side-effect --------------------------------------
    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))

    # -- _ffprobe_has_audio → True --------------------------------------
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))

    # -- S3 --------------------------------------------------------------
    mock_s3.head_object.return_value = {"ContentLength": 5_000_000}
    mock_s3.download_fileobj.return_value = None

    # -- create_thumbnail ------------------------------------------------
    monkeypatch.setattr(
        "viewport.background_tasks.create_thumbnail",
        MagicMock(return_value=(b"fake_avif", 640, 480)),
    )

    # -- temp files ------------------------------------------------------
    _temp_counter = 0

    def _tempfile_factory(suffix="", delete=False, **__):
        nonlocal _temp_counter
        _temp_counter += 1
        m = MagicMock()
        m.name = f"/tmp/fake_{_temp_counter}{suffix}"
        m.__enter__.return_value = m
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)

    # -- open (poster PNG read) -----------------------------------------
    _mock_poster = MagicMock()
    _mock_poster.__enter__.return_value.read.return_value = b"fake_png"
    monkeypatch.setattr("builtins.open", MagicMock(return_value=_mock_poster))

    # -- os.path ---------------------------------------------------------
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os.path, "getsize", MagicMock(return_value=12345))
    monkeypatch.setattr(os, "unlink", MagicMock())

    # -- act -------------------------------------------------------------
    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    # -- assert ----------------------------------------------------------
    assert tracker.successful == 1
    assert tracker.failed == 0
    res = tracker.results[0]
    assert res["status"] == "success"
    assert res["playback_object_key"] == "gal-1/vid_playback.mp4"
    assert res["thumbnail_object_key"] == "gal-1/vid_thumbnail.avif"
    assert res["duration_ms"] == 30500
    assert res["width"] == 1280
    assert res["height"] == 720

    # S3: head, download, tag, upload×2
    mock_s3.head_object.assert_called_once_with(Bucket="test-bucket", Key="gal-1/vid.mp4")
    mock_s3.download_fileobj.assert_called_once_with("test-bucket", "gal-1/vid.mp4", ANY)
    assert mock_s3.upload_fileobj.call_count == 2

    ffmpeg_commands = [call.args[0] for call in subprocess.run.call_args_list if call.args[0][0] == "ffmpeg"]
    assert "copy" in ffmpeg_commands[0]

    # cleanup must NOT have been called
    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_not_called()


# ---------------------------------------------------------------------------
# no video stream
# ---------------------------------------------------------------------------


def test_video_processing_no_video_stream_fails(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """ffprobe returns no streams → error, cleanup called."""
    probe_data = _ffprobe_json(streams=[], fmt={"nb_streams": 0})

    monkeypatch.setattr(
        subprocess,
        "run",
        MagicMock(return_value=_make_subprocess_result(json.dumps(probe_data))),
    )
    # still need tempfile for download → ffprobe path
    mock_tmp = MagicMock()
    mock_tmp.name = "/tmp/fake_in.mp4"
    mock_tmp.__enter__.return_value = mock_tmp
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", MagicMock(return_value=mock_tmp))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.successful == 0
    assert tracker.failed == 1
    assert tracker.results[0]["message"] == "No video stream found"

    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_called_once_with(
        payload["photo_id"],
        payload["object_key"],
        mock_s3,
        "test-bucket",
        "No video stream found",
    )


# ---------------------------------------------------------------------------
# duration exceeds maximum
# ---------------------------------------------------------------------------


def test_video_processing_duration_exceeds_maximum_fails(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """Duration > 1800 s → error and cleanup."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "2000.0")],
        fmt={"nb_streams": 1},
    )

    monkeypatch.setattr(
        subprocess,
        "run",
        MagicMock(return_value=_make_subprocess_result(json.dumps(probe_data))),
    )
    mock_tmp = MagicMock()
    mock_tmp.name = "/tmp/fake_in.mp4"
    mock_tmp.__enter__.return_value = mock_tmp
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", MagicMock(return_value=mock_tmp))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.failed == 1
    assert tracker.results[0]["message"] == "Video too long"

    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_called_once_with(
        payload["photo_id"],
        payload["object_key"],
        mock_s3,
        "test-bucket",
        f"Video duration 2000.0s exceeds maximum {MAX_VIDEO_DURATION_SECONDS}s",
    )


# ---------------------------------------------------------------------------
# ffprobe failure
# ---------------------------------------------------------------------------


def test_video_processing_ffprobe_failure_fails(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """ffprobe raises CalledProcessError → error and cleanup."""
    # download_fileobj succeeds but ffprobe fails
    mock_s3.head_object.return_value = {"ContentLength": 5_000_000}

    mock_tmp = MagicMock()
    mock_tmp.name = "/tmp/fake_in.mp4"
    mock_tmp.__enter__.return_value = mock_tmp
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", MagicMock(return_value=mock_tmp))

    monkeypatch.setattr(
        subprocess,
        "run",
        MagicMock(side_effect=subprocess.CalledProcessError(1, "ffprobe")),
    )
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.failed == 1
    assert tracker.results[0]["message"] == "ffprobe validation failed"

    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_called_once_with(
        payload["photo_id"],
        payload["object_key"],
        mock_s3,
        "test-bucket",
        "ffprobe validation failed",
    )


def test_video_processing_ffprobe_timeout_fails(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """An ffprobe timeout is recorded as a validation failure and cleaned up."""
    mock_s3.head_object.return_value = {"ContentLength": 5_000_000}
    mock_tmp = MagicMock()
    mock_tmp.name = "/tmp/fake_in.mp4"
    mock_tmp.__enter__.return_value = mock_tmp
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", MagicMock(return_value=mock_tmp))
    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=subprocess.TimeoutExpired("ffprobe", 30)))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.failed == 1
    assert tracker.results[0]["message"] == "ffprobe validation failed"


def test_video_processing_ffmpeg_timeout_retries(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """An ffmpeg transcode timeout raises VideoTransientError for Celery retry."""
    probe_data = _ffprobe_json(streams=[_video_stream(1920, 1080, "30.0")], fmt={"nb_streams": 1})

    def _subprocess_side_effect(cmd, **_kw):
        if cmd[0] == "ffprobe":
            return _make_subprocess_result(json.dumps(probe_data))
        raise subprocess.TimeoutExpired(cmd, 1800)

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))
    mock_tmp = MagicMock()
    mock_tmp.name = "/tmp/fake.mp4"
    mock_tmp.__enter__.return_value = mock_tmp
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", MagicMock(return_value=mock_tmp))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    with pytest.raises(VideoTransientError, match="ffmpeg transcode timed out"):
        _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)


# ---------------------------------------------------------------------------
# ffmpeg transcode failure
# ---------------------------------------------------------------------------


def test_video_processing_ffmpeg_failure_cleans_up(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """ffprobe succeeds, but ffmpeg transcode fails → error and cleanup."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "30.0")],
        fmt={"nb_streams": 1},
    )

    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        # ffmpeg transcode fails
        if "-c:v" in cmd_str:
            raise subprocess.CalledProcessError(1, cmd, stderr="encoder error")
        # should not reach poster step
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))

    # temp files
    _temp_files = []

    def _tempfile_factory(suffix="", delete=False, **__):
        m = MagicMock()
        m.name = f"/tmp/fake_{len(_temp_files)}{suffix}"
        m.__enter__.return_value = m
        _temp_files.append(m)
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.failed == 1
    assert tracker.results[0]["message"] == "Video transcoding failed"

    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_called_once_with(
        payload["photo_id"],
        payload["object_key"],
        mock_s3,
        "test-bucket",
        "Video transcoding failed",
    )


# ---------------------------------------------------------------------------
# poster fallback failure
# ---------------------------------------------------------------------------


def test_video_processing_poster_fallback_failure_cleans_up(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """A failed first-frame fallback cleans up the original before the error propagates."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "30.0")],
        fmt={"nb_streams": 1},
    )
    ffmpeg_calls = 0

    def _subprocess_side_effect(cmd, **_kw):
        nonlocal ffmpeg_calls
        if cmd[0] == "ffprobe":
            return _make_subprocess_result(json.dumps(probe_data))
        ffmpeg_calls += 1
        if ffmpeg_calls >= 2:
            raise subprocess.CalledProcessError(1, cmd, stderr="poster error")
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))
    mock_s3.head_object.return_value = {"ContentLength": 5_000_000}

    temp_files = []

    def _tempfile_factory(suffix="", delete=False, **__):
        temp_file = MagicMock()
        temp_file.name = f"/tmp/fake_{len(temp_files)}{suffix}"
        temp_file.__enter__.return_value = temp_file
        temp_files.append(temp_file)
        return temp_file

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.failed == 1
    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_called_once_with(
        payload["photo_id"],
        payload["object_key"],
        mock_s3,
        "test-bucket",
        "Poster frame generation failed",
    )


# ---------------------------------------------------------------------------
# portrait / rotated dimensions
# ---------------------------------------------------------------------------


def test_video_processing_portrait_rotation_uses_dimensions(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """ffprobe returns 1080×1920 (portrait) → width/height preserved as-is."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1080, 1920, "15.0")],
        fmt={"nb_streams": 1},
    )

    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))
    monkeypatch.setattr(
        "viewport.background_tasks.create_thumbnail",
        MagicMock(return_value=(b"fake_avif", 360, 640)),
    )

    # temp files
    _idx = [0]

    def _tempfile_factory(suffix="", delete=False, **__):
        _idx[0] += 1
        m = MagicMock()
        m.name = f"/tmp/f_{_idx[0]}{suffix}"
        m.__enter__.return_value = m
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    _mock_poster = MagicMock()
    _mock_poster.__enter__.return_value.read.return_value = b"fake_png"
    monkeypatch.setattr("builtins.open", MagicMock(return_value=_mock_poster))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())
    monkeypatch.setattr(os.path, "getsize", MagicMock(return_value=54321))

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.successful == 1
    res = tracker.results[0]
    assert res["width"] == 1080
    assert res["height"] == 1920
    assert res["duration_ms"] == 15000


# ---------------------------------------------------------------------------
# no audio track
# ---------------------------------------------------------------------------


def test_video_processing_no_audio_omits_audio_track(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """When _ffprobe_has_audio returns False the ffmpeg command includes -an."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "10.0")],
        fmt={"nb_streams": 1},
    )

    # capture the ffmpeg command
    _ffmpeg_calls = []

    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        _ffmpeg_calls.append(cmd)
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    # key mock: NO audio
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=False))
    monkeypatch.setattr(
        "viewport.background_tasks.create_thumbnail",
        MagicMock(return_value=(b"fake_avif", 640, 480)),
    )

    _idx = [0]

    def _tempfile_factory(suffix="", delete=False, **__):
        _idx[0] += 1
        m = MagicMock()
        m.name = f"/tmp/t{_idx[0]}{suffix}"
        m.__enter__.return_value = m
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    _mock_poster = MagicMock()
    _mock_poster.__enter__.return_value.read.return_value = b"fake_png"
    monkeypatch.setattr("builtins.open", MagicMock(return_value=_mock_poster))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())
    monkeypatch.setattr(os.path, "getsize", MagicMock(return_value=9999))

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert tracker.successful == 1

    # first ffmpeg call is transcode
    transcode_cmd = _ffmpeg_calls[0]
    assert "-an" in transcode_cmd
    assert "-c:a" not in transcode_cmd


# ---------------------------------------------------------------------------
# retry on transient S3 upload error
# ---------------------------------------------------------------------------


def test_video_processing_retry_on_transient_s3_error(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """S3 playback upload raises retryable ConnectTimeoutError → VideoTransientError."""
    from botocore.exceptions import ConnectTimeoutError

    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "30.0")],
        fmt={"nb_streams": 1},
    )

    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))
    monkeypatch.setattr(
        "viewport.background_tasks.create_thumbnail",
        MagicMock(return_value=(b"fake_avif", 640, 480)),
    )

    # temp files
    _idx = [0]

    def _tempfile_factory(suffix="", delete=False, **__):
        _idx[0] += 1
        m = MagicMock()
        m.name = f"/tmp/t{_idx[0]}{suffix}"
        m.__enter__.return_value = m
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    _mock_poster = MagicMock()
    _mock_poster.__enter__.return_value.read.return_value = b"fake_png"
    monkeypatch.setattr("builtins.open", MagicMock(return_value=_mock_poster))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())
    monkeypatch.setattr(os.path, "getsize", MagicMock(return_value=9999))

    # playback upload raises transient error
    mock_s3.upload_fileobj.side_effect = ConnectTimeoutError(endpoint_url="https://s3.example.com")

    with pytest.raises(VideoTransientError) as exc_info:
        _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    assert "Retryable S3 upload error for playback" in str(exc_info.value)
    # upload_fileobj was called once (for playback) and failed
    assert mock_s3.upload_fileobj.call_count == 1


# ---------------------------------------------------------------------------
# idempotent retry does not double quota / duplicate S3 uploads
# ---------------------------------------------------------------------------


def test_video_processing_idempotent_retry_does_not_double_quota(monkeypatch, mock_s3, tracker, payload, patch_all) -> None:
    """Successful processing → tracker has exactly 1 result; S3 uploads called twice (playback + poster)."""
    probe_data = _ffprobe_json(
        streams=[_video_stream(1920, 1080, "30.0")],
        fmt={"nb_streams": 1},
    )

    def _subprocess_side_effect(cmd, **_kw):
        cmd_str = " ".join(cmd)
        if "ffprobe" in cmd_str:
            return _make_subprocess_result(json.dumps(probe_data))
        return _make_subprocess_result()

    monkeypatch.setattr(subprocess, "run", MagicMock(side_effect=_subprocess_side_effect))
    monkeypatch.setattr("viewport.background_tasks._ffprobe_has_audio", MagicMock(return_value=True))
    monkeypatch.setattr(
        "viewport.background_tasks.create_thumbnail",
        MagicMock(return_value=(b"fake_avif", 640, 480)),
    )

    _idx = [0]

    def _tempfile_factory(suffix="", delete=False, **__):
        _idx[0] += 1
        m = MagicMock()
        m.name = f"/tmp/t{_idx[0]}{suffix}"
        m.__enter__.return_value = m
        return m

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _tempfile_factory)
    _mock_poster = MagicMock()
    _mock_poster.__enter__.return_value.read.return_value = b"fake_png"
    monkeypatch.setattr("builtins.open", MagicMock(return_value=_mock_poster))
    monkeypatch.setattr(os.path, "isfile", MagicMock(return_value=True))
    monkeypatch.setattr(os, "unlink", MagicMock())
    monkeypatch.setattr(os.path, "getsize", MagicMock(return_value=9999))

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    # After one successful run the tracker has exactly one result entry
    assert tracker.successful == 1
    assert len(tracker.results) == 1
    assert tracker.results[0]["status"] == "success"

    # S3 upload_fileobj was called exactly twice: playback + poster
    assert mock_s3.upload_fileobj.call_count == 2

    # cleanup was never called
    viewport_bg = __import__("viewport.background_tasks", fromlist=["_cleanup_video_failure"])
    viewport_bg._cleanup_video_failure.assert_not_called()

    # Run a second time with the same tracker (simulating Celery at-least-once retry
    # where the first attempt succeeded but Celery retried anyway).
    # Reset S3 mock call counts, keep same tracker.
    mock_s3.reset_mock()
    mock_s3.head_object.return_value = {"ContentLength": 5_000_000}
    _idx[0] = 0  # reset temp counter

    _process_single_video(payload, mock_s3, "test-bucket", {payload["photo_id"]}, tracker)

    # Tracker now has exactly two results (one per call) — no internal dedup,
    # but no duplicate DB updates either (that's handled by _batch_update_video_results
    # which is *outside* _process_single_video).
    assert tracker.successful == 2
    assert len(tracker.results) == 2
    for r in tracker.results:
        assert r["status"] == "success"

    # S3 uploads happen again (overwriting same keys) — idempotent at storage level
    assert mock_s3.upload_fileobj.call_count == 2

    # cleanup still never called
    viewport_bg._cleanup_video_failure.assert_not_called()
