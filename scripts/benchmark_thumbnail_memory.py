#!/usr/bin/env python3
"""Measure thumbnail latency and RSS in isolated worker processes.

The benchmark deliberately imports ``viewport.s3_utils`` inside spawned child
processes. Generated inputs are created by the parent before workers start, so
fixture construction does not inflate the measured worker baseline.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import multiprocessing
import os
import platform
import resource
import statistics
import sys
import tempfile
import threading
import time
from collections import defaultdict
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

ThumbnailFunction = Callable[[str, tuple[int, int], int], tuple[bytes, int, int]]

_thumbnail_function: ThumbnailFunction | None = None


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be at least 0")
    return parsed


def _dimensions(value: str) -> tuple[int, int]:
    try:
        width_text, height_text = value.lower().split("x", maxsplit=1)
        width, height = int(width_text), int(height_text)
    except (TypeError, ValueError) as error:
        raise argparse.ArgumentTypeError("expected WIDTHxHEIGHT") from error
    if width < 1 or height < 1:
        raise argparse.ArgumentTypeError("width and height must be positive")
    return width, height


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark viewport's path-based AVIF thumbnail pipeline and emit JSON.",
    )
    parser.add_argument("files", nargs="*", type=Path, help="JPEG/PNG/etc. inputs to benchmark")
    parser.add_argument(
        "--generate",
        action="store_true",
        help="also generate a representative EXIF JPEG and transparent PNG (implied when no files are given)",
    )
    parser.add_argument(
        "--generated-size",
        type=_dimensions,
        default=(6000, 4000),
        metavar="WIDTHxHEIGHT",
        help="dimensions for generated cases (default: 6000x4000)",
    )
    parser.add_argument("--iterations", type=_positive_int, default=1, help="measured iterations per input")
    parser.add_argument(
        "--warmup-iterations",
        type=_non_negative_int,
        default=0,
        help="unreported warm-up iterations per input before measurement",
    )
    parser.add_argument("--concurrency", type=_positive_int, default=1, help="spawned worker process count")
    parser.add_argument(
        "--max-size",
        type=_dimensions,
        default=(1000, 1000),
        metavar="WIDTHxHEIGHT",
        help="thumbnail bounding box (default: 1000x1000)",
    )
    parser.add_argument("--quality", type=int, choices=range(1, 101), default=70, metavar="1..100")
    parser.add_argument(
        "--sample-interval-ms",
        type=float,
        default=5.0,
        help=("RSS sampling interval inside each child; spikes shorter than the interval may be missed, so use cgroup memory.peak for aggregate acceptance (default: 5)"),
    )
    parser.add_argument("--indent", type=_non_negative_int, default=None, help="pretty-print JSON with this indent")
    args = parser.parse_args(argv)
    if args.sample_interval_ms <= 0:
        parser.error("--sample-interval-ms must be greater than 0")
    for input_path in args.files:
        if not input_path.is_file():
            parser.error(f"input is not a file: {input_path}")
    return args


def _initialize_worker() -> None:
    global _thumbnail_function

    from viewport.s3_utils import create_thumbnail_from_path

    _thumbnail_function = create_thumbnail_from_path


def _current_rss_bytes(pid: int | None = None) -> int:
    status_path = Path(f"/proc/{pid or 'self'}/status")
    try:
        for line in status_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except FileNotFoundError, PermissionError, ValueError:
        pass
    return _lifetime_peak_rss_bytes()


def _lifetime_peak_rss_bytes() -> int:
    max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux reports KiB; macOS reports bytes. The production benchmark target
    # is Linux, but this keeps local development output correctly scaled.
    return int(max_rss if sys.platform == "darwin" else max_rss * 1024)


def _cgroup_memory() -> dict[str, Any] | None:
    """Read cgroup v2 aggregate memory when running inside a Linux container."""

    root = Path("/sys/fs/cgroup")
    try:
        current = int((root / "memory.current").read_text(encoding="utf-8").strip())
        peak = int((root / "memory.peak").read_text(encoding="utf-8").strip())
        events = {key: int(value) for key, value in (line.split(maxsplit=1) for line in (root / "memory.events").read_text(encoding="utf-8").splitlines())}
    except FileNotFoundError, PermissionError, ValueError:
        return None
    return {"current_bytes": current, "peak_bytes": peak, "events": events}


def _sample_rss(stop: threading.Event, interval_seconds: float, samples: list[int]) -> None:
    while not stop.is_set():
        samples.append(_current_rss_bytes())
        stop.wait(interval_seconds)


def _measure_case(job: dict[str, Any]) -> dict[str, Any]:
    if _thumbnail_function is None:
        raise RuntimeError("thumbnail worker was not initialized")

    rss_before = _current_rss_bytes()
    process_peak_before = max(_lifetime_peak_rss_bytes(), rss_before)
    rss_samples = [rss_before]
    stop = threading.Event()
    sampler = threading.Thread(
        target=_sample_rss,
        args=(stop, job["sample_interval_seconds"], rss_samples),
        daemon=True,
    )
    started = time.perf_counter_ns()
    sampler.start()
    result: dict[str, Any] = {
        "case": job["case"],
        "iteration": job["iteration"],
        "worker_pid": os.getpid(),
        "input_path": job["path"],
        "input_bytes": job["input_bytes"],
    }
    try:
        thumbnail, width, height = _thumbnail_function(
            job["path"],
            tuple(job["max_size"]),
            job["quality"],
        )
        result.update(
            status="ok",
            output_width=width,
            output_height=height,
            output_bytes=len(thumbnail),
        )
        del thumbnail
    except Exception as error:  # Emit failures as data so long runs remain machine-readable.
        result.update(
            status="error",
            error_type=type(error).__name__,
            error_message=str(error),
        )
    finally:
        stop.set()
        sampler.join()

    rss_after = _current_rss_bytes()
    rss_samples.append(rss_after)
    process_peak_after = max(_lifetime_peak_rss_bytes(), *rss_samples)
    result.update(
        duration_seconds=(time.perf_counter_ns() - started) / 1_000_000_000,
        rss_before_bytes=rss_before,
        current_rss_bytes=rss_after,
        sampled_peak_rss_bytes=max(rss_samples),
        process_peak_rss_bytes=process_peak_after,
        process_peak_growth_bytes=max(0, process_peak_after - process_peak_before),
    )
    return result


def _draw_pattern(image: Any) -> None:
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    width, height = image.size
    stripe_height = max(32, height // 80)
    for y in range(0, height, stripe_height):
        stripe = y // stripe_height
        red = (37 * stripe + 31) % 256
        green = (67 * stripe + 47) % 256
        blue = (97 * stripe + 61) % 256
        alpha = 96 + (stripe * 29) % 160 if image.mode == "RGBA" else 255
        draw.rectangle((0, y, width, min(height, y + stripe_height)), fill=(red, green, blue, alpha))
    draw.ellipse(
        (width // 5, height // 5, width * 4 // 5, height * 4 // 5),
        fill=(220, 120, 45, 176) if image.mode == "RGBA" else (220, 120, 45),
    )


def _generate_cases(directory: Path, size: tuple[int, int]) -> list[dict[str, Any]]:
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Pillow is required for --generate; pass real input files instead") from error

    cases: list[dict[str, Any]] = []
    jpeg_path = directory / f"generated-{size[0]}x{size[1]}-exif6.jpg"
    jpeg = Image.new("RGB", size)
    _draw_pattern(jpeg)
    exif = jpeg.getexif()
    exif[274] = 6  # Rotate 90 degrees clockwise when rendered upright.
    jpeg.save(jpeg_path, format="JPEG", quality=91, exif=exif)
    jpeg.close()
    cases.append(_case_metadata(jpeg_path, "generated-jpeg-exif6", generated=True))

    png_path = directory / f"generated-{size[0]}x{size[1]}-alpha.png"
    png = Image.new("RGBA", size, (0, 0, 0, 0))
    _draw_pattern(png)
    png.save(png_path, format="PNG", compress_level=3)
    png.close()
    cases.append(_case_metadata(png_path, "generated-png-alpha", generated=True))
    return cases


def _case_metadata(path: Path, name: str | None = None, *, generated: bool) -> dict[str, Any]:
    resolved = path.resolve()
    return {
        "case": name or resolved.name,
        "path": os.fspath(resolved),
        "input_bytes": resolved.stat().st_size,
        "generated": generated,
    }


def _nearest_rank(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percentile * len(ordered)) - 1)]


def _summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    successful = [result for result in results if result["status"] == "ok"]
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in successful:
        grouped[result["case"]].append(result)

    by_case: dict[str, Any] = {}
    for case, case_results in sorted(grouped.items()):
        durations = [result["duration_seconds"] for result in case_results]
        per_worker: defaultdict[int, list[dict[str, Any]]] = defaultdict(list)
        for result in case_results:
            per_worker[result["worker_pid"]].append(result)
        worker_rss_changes = []
        for worker_results in per_worker.values():
            ordered = sorted(worker_results, key=lambda result: result["iteration"])
            worker_rss_changes.append(ordered[-1]["current_rss_bytes"] - ordered[0]["current_rss_bytes"])
        by_case[case] = {
            "successful_iterations": len(case_results),
            "duration_p50_seconds": statistics.median(durations),
            "duration_p95_seconds": _nearest_rank(durations, 0.95),
            "max_current_rss_bytes": max(result["current_rss_bytes"] for result in case_results),
            "max_sampled_peak_rss_bytes": max(result["sampled_peak_rss_bytes"] for result in case_results),
            "max_process_peak_rss_bytes": max(result["process_peak_rss_bytes"] for result in case_results),
            "max_worker_steady_rss_change_bytes": max(worker_rss_changes),
        }

    return {
        "successful_iterations": len(successful),
        "failed_iterations": len(results) - len(successful),
        "max_worker_current_rss_bytes": max((result["current_rss_bytes"] for result in results), default=0),
        "max_worker_sampled_peak_rss_bytes": max((result["sampled_peak_rss_bytes"] for result in results), default=0),
        "max_worker_process_peak_rss_bytes": max((result["process_peak_rss_bytes"] for result in results), default=0),
        "by_case": by_case,
    }


def _jobs(cases: list[dict[str, Any]], iterations: int, args: argparse.Namespace) -> list[dict[str, Any]]:
    return [
        {
            **case,
            "iteration": iteration,
            "max_size": args.max_size,
            "quality": args.quality,
            "sample_interval_seconds": args.sample_interval_ms / 1000,
        }
        for iteration in range(1, iterations + 1)
        for case in cases
    ]


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="viewport-thumbnail-benchmark-") as generated_directory:
        cases = [_case_metadata(path, generated=False) for path in args.files]
        if args.generate or not cases:
            cases.extend(_generate_cases(Path(generated_directory), args.generated_size))

        context = multiprocessing.get_context("spawn")
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=args.concurrency,
            mp_context=context,
            initializer=_initialize_worker,
        ) as executor:
            if args.warmup_iterations:
                list(executor.map(_measure_case, _jobs(cases, args.warmup_iterations, args)))
            measured_started = time.perf_counter()
            results = list(executor.map(_measure_case, _jobs(cases, args.iterations, args)))
            measured_wall_seconds = time.perf_counter() - measured_started

        summary = _summarize(results)
        summary.update(
            measured_wall_seconds=measured_wall_seconds,
            successful_images_per_second=(summary["successful_iterations"] / measured_wall_seconds if measured_wall_seconds else 0),
            cgroup_memory=_cgroup_memory(),
        )

        payload = {
            "schema_version": 1,
            "benchmark": {
                "iterations_per_input": args.iterations,
                "warmup_iterations_per_input": args.warmup_iterations,
                "concurrency": args.concurrency,
                "max_size": list(args.max_size),
                "quality": args.quality,
                "sample_interval_ms": args.sample_interval_ms,
                "aggregate_memory_note": "Per-worker RSS and, when available, cgroup v2 aggregate current/peak/events are reported.",
            },
            "environment": {
                "python": platform.python_version(),
                "platform": platform.platform(),
                "vips_concurrency": os.environ.get("VIPS_CONCURRENCY", "application default"),
            },
            "inputs": cases,
            "results": results,
            "summary": summary,
        }
        sys.stdout.write(json.dumps(payload, indent=args.indent, sort_keys=True) + "\n")
        return 1 if summary["failed_iterations"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
