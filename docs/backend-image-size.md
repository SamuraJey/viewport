# Backend image size and build speed

The backend and Celery workers share one runtime image. Production installs
Debian's prebuilt `ffmpeg`, `libvips42t64`, `libheif-plugin-aomenc` and
`libimage-exiftool-perl` packages with `--no-install-recommends`. FFmpeg and
libvips are no longer compiled from source during application builds. This
prioritizes simpler, lower-CPU cold builds on GitHub Actions and the release NAS.

## Build layout

The Python dependency builder retains `build-essential`, `libvips-dev` and
`pkg-config` for the compiled pyvips API binding. Build tools and development
headers do not enter production. Builder and runtime use the same Python/Debian
base so the binding uses the distribution's libvips ABI.

Production Python dependencies are installed without eager bytecode compilation.
Any `.pyc` files are removed and native Python shared libraries are stripped of
debug symbols before copying the environment into runtime. Dynamic symbols and
package data, including Babel and botocore data, remain intact.

The `test-deps` stage extends the production dependency builder with dev
packages. Application source is copied directly into runtime after dependencies,
so editing source does not invalidate production or test dependency installation.
The final/default `runtime` target remains production-only and non-root; `test`
inherits the same native media environment.

## Cache and update behavior

Apt and uv downloads use BuildKit cache mounts. GitHub Actions imports/exports
its shared `backend` layer cache; the release NAS reuses its Docker daemon's
local cache. These are independent caches. See [backend-ci.md](backend-ci.md).
Missing caches now cause package downloads and Python dependency installation,
rather than FFmpeg/libvips source compilation.

Routine builds should reuse cache. To refresh the base image and Debian security
packages, deliberately rebuild with `--pull --no-cache`; this also reinstalls
Python dependencies. Ordinary cache hits do not refresh apt packages.

## Size tradeoff and historical measurements

Earlier local measurements (uncompressed Docker image sizes) were:

| Configuration | Bytes |
| --- | ---: |
| Original Debian packages and Python environment | 921,037,493 |
| Custom FFmpeg | 566,314,333 |
| Custom FFmpeg/libvips and stripped Python environment | 393,651,276 |

Debian's general-purpose FFmpeg pulls in graphics/device dependencies, including
Mesa/LLVM. `--no-install-recommends` does not remove hard dependencies. Custom
libvips also removed unused PDF/SVG/RAW/scientific integrations. Returning to
prebuilt packages accepts those dependencies in exchange for avoiding expensive
native builds. Python stripping and bytecode removal are retained; historically
the Python layer fell from 214 MB to 134 MB.

These are historical results, not measurements of the current Dockerfile.
Registry transfer sizes are compressed and must not be compared directly with
uncompressed Docker sizes.

### Local verification after switching to packages

On the verification machine (amd64, Python 3.14.10 / Debian trixie), the first
runtime build took approximately 195 seconds including package installation and
image export. The unchanged warm build took 2.1 seconds. A source-only change in
a temporary copy rebuilt the test image in 20 seconds; both production and dev
`uv sync` layers remained cached. These timings are local observations, not a
GitHub/NAS guarantee or a controlled comparison with the former Dockerfile.

The runtime's history layer sizes sum to approximately 875 MB (including a
587 MB apt layer and a 154 MB Python environment). On this Docker installation,
`docker image inspect --format '{{.Size}}'` reported 1,182,272,045 bytes; retain
the measurement method when comparing results. The frontend image initially reported
98,438,693 bytes; switching to nginx 1.31.8 alpine-slim subsequently reduced it
to 25,361,038 bytes (see [release-builds.md](deployment/release-builds.md)). The current backend is larger than the historical compact
image; using ready-made distribution packages deliberately accepts that cost.

The native media smoke check and frontend Docker build passed. The full backend
suite in the test container passed 1,007 tests with 88.82% branch-aware coverage
(75% gate); three tests already explicitly marked skipped in the repository
remained skipped. There were no Docker-availability skips.

## Verification

`ci/check_backend_media.py` runs during the runtime-base build and verifies
pyvips API mode, JPEG orientation, publication JPEG/ICC/alpha, PNG/AVIF,
FFprobe, video input decoders, H.264/AAC conversion, scale/pixel-format/FPS,
faststart remux and PNG posters. Both runtime and test inherit this check.
Do not remove libraries or package data manually to reduce size.

```sh
docker build --target runtime -f Dockerfile.backend -t viewport/backend:package-check .
docker image inspect viewport/backend:package-check --format '{{.Size}}'
docker history viewport/backend:package-check --format '{{.Size}} {{.CreatedBy}}'
docker build --target test -f Dockerfile.backend -t viewport/backend-test:package-check .
```

For performance comparison, use the same builder and record cold, warm and
source-only-change builds separately. Record image size and separate build time
from pull/push and cache export time. Cold builds must contain no FFmpeg/libvips
compilation; source-only changes should reuse dependency installation layers.
Run the existing thumbnail, rotation, publication and video tests in the test
container, followed by the normal backend coverage job.
