"""Exercise native media tools in the production image without DB/S3 services."""

import json
import logging
import subprocess
import tempfile
import wave
from pathlib import Path

import pyvips


def run(*args: str) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr}")
    return result.stdout


def probe(path: Path) -> list[dict]:
    return json.loads(run("ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)))["streams"]


assert pyvips.API_mode
# Containers do not constrain input codecs: MOV can contain HEVC, WebM VP9/AV1,
# and older AVI/3GP uploads can contain MPEG-4, MJPEG or H.263/AMR audio.
decoders = {fields[1] for line in run("ffmpeg", "-v", "error", "-decoders").splitlines() if len(fields := line.split()) >= 2}
required_decoders = {"h264", "hevc", "vp8", "vp9", "libdav1d", "mpeg4", "mpeg1video", "mpeg2video", "mjpeg", "h263", "aac", "mp3", "opus", "vorbis", "amrnb", "amrwb", "pcm_s16le"}
assert required_decoders <= decoders, f"Missing input decoders: {required_decoders - decoders}"
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    image = pyvips.Image.black(1300, 98, bands=3).copy(interpretation="srgb")
    # Photo color profiles must remain supported by the reduced libvips build.
    color_managed = image.icc_transform("srgb", input_profile="srgb")
    assert color_managed.get("icc-profile-data")
    image.ppmsave(str(root / "frame.ppm"))
    image.jpegsave(str(root / "photo.jpg"))
    run("exiftool", "-overwrite_original", "-n", "-IFD0:Orientation=6", str(root / "photo.jpg"))
    rotated = pyvips.Image.new_from_file(str(root / "photo.jpg")).autorot()
    assert (rotated.width, rotated.height) == (98, 1300)
    assert rotated.pngsave_buffer()
    encoded = bytes(rotated.heifsave_buffer(compression="av1", Q=70))
    assert encoded[4:12] == b"ftypavif"

    with wave.open(str(root / "audio.wav"), "wb") as audio:
        audio.setparams((1, 2, 44100, 0, "NONE", "not compressed"))
        audio.writeframes(b"\0\0" * 44100)

    source, playback, remux, poster = (root / name for name in ("source.mov", "playback.mp4", "remux.mp4", "poster.png"))
    run(
        "ffmpeg",
        "-v",
        "error",
        "-loop",
        "1",
        "-framerate",
        "70",
        "-i",
        str(root / "frame.ppm"),
        "-i",
        str(root / "audio.wav"),
        "-t",
        "0.3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv444p",
        "-c:a",
        "pcm_s16le",
        str(source),
    )
    # The worker's slow path: resize, pixel format, FPS, H.264 + AAC.
    run(
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(source),
        "-vf",
        "scale='min(1280,iw)':-2,format=yuv420p,fps=60",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-maxrate",
        "2M",
        "-bufsize",
        "4M",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "mp4",
        str(playback),
    )
    streams = probe(playback)
    video = next(stream for stream in streams if stream["codec_type"] == "video")
    assert (video["codec_name"], video["pix_fmt"], video["width"], video["r_frame_rate"]) == ("h264", "yuv420p", 1280, "60/1")
    assert any(stream["codec_name"] == "aac" for stream in streams)
    # The worker's fast path and PNG poster extraction.
    run("ffmpeg", "-v", "error", "-i", str(playback), "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", str(remux))
    assert probe(remux)
    run("ffmpeg", "-v", "error", "-ss", "0", "-i", str(source), "-frames:v", "1", str(poster))
    assert pyvips.Image.new_from_file(str(poster)).heifsave_buffer(compression="av1", Q=70)

logging.basicConfig(level=logging.INFO)
logging.info("Native media smoke check passed: JPEG orientation, PNG, AVIF, FFprobe, H.264/AAC, remux, poster")
