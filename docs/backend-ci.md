# Backend tests in Docker

The backend CI job builds the `runtime` and `test` targets of
`Dockerfile.backend` sequentially on one BuildKit builder, then runs pytest
through `docker run`. The test build reuses the production build stages. No
Python or media-library installation on the GitHub runner is needed.

## Image targets

- `ffmpeg-build`: compiles Debian's patched FFmpeg source with shared libraries,
  built-in file/container codecs, libx264 and libdav1d, without autodetected
  GUI/GPU/device dependencies. Only the installed runtime tools, libraries and
  licenses are copied into production.
- `build`: production Python environment from the locked dependencies, compiled
  with the existing libvips build toolchain. Dependency bytecode is omitted and
  native Python libraries have debug symbols stripped; source and dynamic
  symbols remain intact.
- `vips-build`: compiles Debian's patched libvips source with JPEG, PNG, AVIF,
  EXIF, Little CMS and Highway SIMD. Unused PDF/SVG/RAW/scientific loaders and
  their transitive runtime dependencies are excluded.
- `runtime-base`: production Python environment, source and native runtime
  packages (ExifTool, libvips, FFmpeg and AVIF encoder). The native media smoke
  check (`ci/check_backend_media.py`) verifies JPEG orientation, ICC, PNG/AVIF,
  FFprobe, H.264/AAC transcoding, scale/format/FPS, remux and poster extraction
  for both production and test builds.
- `test-deps`: extends `build` with the locked dev dependencies; the production
  packages, including the compiled pyvips binding, are retained.
- `test`: extends `runtime-base` with the dev environment, tests, pytest
  configuration and Alembic configuration. It verifies ExifTool, pyvips API
  mode, PNG rotation and AVIF encoding during build. It has no app healthcheck.
- `runtime`: the final/default production target, derived from `runtime-base`,
  running as `appuser`. It does not inherit tests or dev dependencies.

Testcontainers needs a live Docker daemon, so integration tests run **after**
image build, not in a Dockerfile `RUN pytest` instruction. BuildKit and uv
download caches are retained. Both builds read the shared `backend` layer cache
(and the former `backend-image` / `backend-tests` scopes during migration); only
the test build exports `mode=max` to `backend`, once per job. CI also runs on
pushes to `main`, so new pull requests can read the default branch cache instead
of recompiling native dependencies with an empty cache. GitHub limits cache
visibility by branch: caches written by one PR cannot seed another PR.

FFmpeg source download uses apt cache mounts, but compilation runs in a separate
step without those mounts. This releases the shared apt locks before the long
compile, allowing other stages to install packages. The installed codecs and
final image contents remain the same. Cold builds and base-image updates still
require native compilation; cache reuse does not replace cold-build budgets.

## Testcontainers and runner isolation

The test container runs on an ephemeral Linux GitHub runner with:

- the runner's `/var/run/docker.sock` mounted at the same path;
- `--network host`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1` and
  `TESTCONTAINERS_CONNECTION_MODE=docker_host`, so PostgreSQL, RustFS, Valkey
  and Ryuk are reached through their published host ports;
- only the report directory mounted from the checkout, not the whole source
  tree or host filesystem. The source and tests are baked into the image.

The test target runs as root to access the socket and write mounted reports.
It does **not** require `--privileged` or Docker-in-Docker; Ryuk remains enabled
to clean up test services. Socket access grants control of the runner's Docker
daemon: use this workflow only on isolated disposable runners, never on a
production/shared daemon. Pull-request jobs stay under `pull_request`, not
`pull_request_target`, and do not pass deployment credentials into the container.

## Coverage and failures

Before executing a selection that needs PostgreSQL, S3, or Valkey, pytest checks
Docker availability with one ping and a two-second request timeout. Required CI
validation passes `--require-docker`: unavailable Docker fails immediately with a
nonzero exit code before tests or containers start, including under xdist.
Optional local runs omit this flag. In those runs, if Docker is unavailable,
container-dependent tests are skipped before setup, without SDK tracebacks,
container startup, or per-test connection attempts. Other tests continue to run,
including in a mixed selection via `pytest -n 4 tests/`. A single
`Docker is unavailable` explanation is printed in the terminal summary. Start Docker
and check socket permissions / `DOCKER_HOST`, then rerun. Under xdist the controller
checks once and passes the result to workers. In optional local runs, missing
Docker alone does not make the run fail; skipped tests remain visible in pytest
reports. The terminal summary warns that a green result / exit code 0 does not mean all checks passed:
Docker-dependent tests were skipped, not passed. AI agents must report incomplete
validation and rerun the skipped tests with Docker before claiming full validation.

Container fixtures start lazily once per worker, only when requested, and retain
per-test database cleanup and S3 bucket isolation. Unit-only selections can run
without Docker (xdist still performs its one controller probe). `--collect-only`
does not contact Docker. Fixtures requested dynamically also check the cached
result and skip without SDK tracebacks if Docker is unavailable.

Alembic logging setup preserves existing application loggers with
`disable_existing_loggers=False`. Otherwise migration tests disable loggers such
as `viewport.s3_service` for the rest of that worker's lifetime, making log
assertions depend on randomized test order and xdist scheduling. The regression
test in `tests/test_alembic_logging.py` runs the real offline migration environment
twice in a separate process and checks that the S3 logger still emits errors;
it needs no database and does not replace pytest's logging handlers.

Import-only lifespan tests mock `viewport.admin.ViewportAdmin`, the concrete
class used by the app. Mocking its `sqladmin.Admin` base before the subclass is
imported corrupts subclass construction and makes startup tests depend on which
modules a worker imported first.

The existing 75% coverage gate with branch measurement, pytest-xdist and randomized
module order are preserved. The combined backend job has a 30-minute timeout
for cold builds, integration tests, cache export and report collection. The
coverage comment runs only for pull requests.
Coverage uses relative source paths and writes `.coverage`
and `coverage.xml` under `/reports`, backed by `.ci-reports` on the runner.
An always-run collection step restores runner ownership and copies existing
reports to the checkout root, where the non-blocking PR coverage action reads
them, even if pytest fails. The pytest exit code still fails the job.

## Reproduce locally (Linux)

Run from the repository root with a local Docker daemon:

```sh
docker build --target test -f Dockerfile.backend -t viewport/backend-test:local .
mkdir -p .ci-reports
docker run --rm --network host \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
  --mount "type=bind,source=$PWD/.ci-reports,target=/reports" \
  -e CI=true -e JWT_SECRET_KEY=supersecretkey \
  -e TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 \
  -e TESTCONTAINERS_CONNECTION_MODE=docker_host \
  -e COVERAGE_FILE=/reports/.coverage \
  viewport/backend-test:local \
  pytest -n auto --cov=src --cov-branch --cov-report=xml:/reports/coverage.xml \
  --cov-fail-under=75 --random-order-bucket=module --random-order-seed=42 tests/
```

To run a targeted check, replace the pytest arguments, for example with
`pytest tests/test_photo_rotation.py -q`. On large local machines, use `-n 4`
instead of `-n auto` to bound workers. Host networking here is Linux-specific;
Docker Desktop/remote daemons require a separate networking configuration.
