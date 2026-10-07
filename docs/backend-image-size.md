# Backend image size

The backend and Celery workers share one runtime image. It includes Python,
production Python dependencies, ExifTool, libvips/AVIF and FFmpeg. The build
toolchain and Python dev dependencies stay in separate stages.

## Main source of excess size

The locally inspected `viewport-app:latest` image was 921 MB (Docker's
uncompressed size). Its native package installation layer was 578 MB; the
Python environment layer was 214 MB. Debian's general-purpose FFmpeg brought
in graphics/device dependencies, including libllvm19 (124 MiB), Mesa Gallium
(41 MiB), libz3 (27 MiB) and speech synthesis data (libflite, 27 MiB).

`--no-install-recommends` cannot remove these hard dependencies. Apt download
and index caches already use BuildKit cache mounts, so clearing them is not
the main improvement. A registry push reports individual layer transfer sizes,
which must not be compared directly with the uncompressed full image size.

## FFmpeg build

`ffmpeg-build` retrieves source through Debian's signed apt repositories,
including distribution patches, rather than fetching an unverified third-party
binary. It builds shared FFmpeg libraries and `ffmpeg`/`ffprobe` with:

- all available built-in input codecs, demuxers, parsers and software filters;
- libdav1d for AV1 input and libx264 for H.264 output;
- native AAC encoding, PNG posters and zlib/bzip2/lzma support;
- no autodetected external libraries, ffplay, device capture, network input,
  debug symbols or development headers in the final image.

Uploaded files are downloaded from S3 by Python before FFmpeg reads them, so
FFmpeg does not need network protocols. HEVC, VP8/VP9, MPEG and other built-in
decoders remain enabled. This is a CPU build; it does not provide hardware
acceleration. ExifTool, Debian libvips and the AVIF encoder are retained.

Compilation uses four jobs by default; set `--build-arg FFMPEG_BUILD_JOBS=2`
for a smaller builder. Cold builds take longer; the compiled stage is cached
independently of application code and Python dependency changes. Rebuild with
`--pull --no-cache` to pick up base image and Debian source/security updates.

## Verification and size measurements

The runtime-base build runs `ci/check_backend_media.py` using a read-only
BuildKit bind mount. The script exercises actual image orientation, PNG/AVIF,
FFprobe, H.264/AAC, scale/pixel-format/FPS conversion, faststart remux and PNG
poster extraction. It does not need PostgreSQL, Redis or S3. The test target
inherits the same compiled FFmpeg and native runtime libraries.

Local builds of the original and updated Dockerfiles with identical application
code and Python dependencies measured 921,037,493 and 566,314,333 bytes
respectively: a reduction of 354,723,160 bytes (38.5%). The updated native package
layer is 199 MB, plus 24.9 MB for compiled FFmpeg. These are uncompressed Docker
image/layer sizes, not registry transfer sizes, and will vary with updates.
Real short fixtures in MP4, M4V, MOV, WebM, MKV, AVI, MPEG and 3GP using H.264,
HEVC, VP8, VP9, AV1, MPEG-4, MPEG-2 and H.263 all passed H.264/AAC conversion
and PNG poster extraction in the updated non-root production container.

```sh
docker build --target runtime -f Dockerfile.backend -t viewport/backend:slim-check .
docker image inspect viewport/backend:slim-check --format '{{.Size}}'
docker history viewport/backend:slim-check --format '{{.Size}} {{.CreatedBy}}'
docker build --target test -f Dockerfile.backend -t viewport/backend-test:slim-check .
```

Do not remove random shared libraries or Python package data to save space:
that can silently break media formats, botocore service definitions or the admin UI.
