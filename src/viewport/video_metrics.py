"""Prometheus metrics for the video processing pipeline."""

from prometheus_client import Counter, Gauge, Histogram

VIDEO_QUEUE_DEPTH = Gauge(
    "viewport_video_queue_depth",
    "Number of video processing tasks currently queued",
)

VIDEO_TRANSCODE_DURATION_SECONDS = Histogram(
    "viewport_video_transcode_duration_seconds",
    "Time spent transcoding a single video",
    buckets=(1, 5, 15, 30, 60, 120, 300, 600, 900, 1800),
)

VIDEO_PROCESSING_ERRORS = Counter(
    "viewport_video_processing_errors_total",
    "Video processing errors by failure class and detected format",
    ["reason", "format"],
)

VIDEO_PROCESSING_RETRIES = Counter(
    "viewport_video_processing_retries_total",
    "Number of video processing retries",
)

VIDEO_ORIGINAL_SIZE_BYTES = Histogram(
    "viewport_video_original_size_bytes",
    "Size of uploaded original video files",
    buckets=(1_048_576, 10_485_760, 52_428_800, 104_857_600, 262_144_000, 524_288_000),
)

VIDEO_DERIVATIVE_SIZE_BYTES = Histogram(
    "viewport_video_derivative_size_bytes",
    "Size of generated playback MP4 files",
    buckets=(1_048_576, 10_485_760, 52_428_800, 104_857_600, 262_144_000, 524_288_000),
)

VIDEO_POSTER_SIZE_BYTES = Histogram(
    "viewport_video_poster_size_bytes",
    "Size of generated poster AVIF files",
    buckets=(1024, 10_240, 51_200, 102_400, 512_000, 1_048_576),
)

VIDEO_CLEANUP_FAILURES = Counter(
    "viewport_video_cleanup_failures_total",
    "Failures to clean up original/playback/poster S3 objects",
    ["media_type"],
)


def _format_from_object_key(object_key: str) -> str:
    """Extract a normalized container extension for metric labels."""
    if "." not in object_key:
        return "unknown"
    ext = object_key.rsplit(".", 1)[-1].lower()
    return ext if ext else "unknown"


def report_processing_error(reason: str, object_key: str) -> None:
    VIDEO_PROCESSING_ERRORS.labels(reason=reason, format=_format_from_object_key(object_key)).inc()


def report_transcode_duration(seconds: float) -> None:
    VIDEO_TRANSCODE_DURATION_SECONDS.observe(seconds)


def report_retry() -> None:
    VIDEO_PROCESSING_RETRIES.inc()


def report_original_size(bytes_size: int) -> None:
    VIDEO_ORIGINAL_SIZE_BYTES.observe(bytes_size)


def report_derivative_sizes(playback_bytes: int, poster_bytes: int) -> None:
    VIDEO_DERIVATIVE_SIZE_BYTES.observe(playback_bytes)
    VIDEO_POSTER_SIZE_BYTES.observe(poster_bytes)


def report_cleanup_failure(media_type: str = "video") -> None:
    VIDEO_CLEANUP_FAILURES.labels(media_type=media_type).inc()
