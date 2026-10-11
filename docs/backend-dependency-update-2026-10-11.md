# Backend dependency update — 2026-10-11

All Python runtime, development and build dependencies were checked against
stable PyPI releases. `pyproject.toml` now requires the current compatible
versions, and `uv.lock` was regenerated with `uv lock --upgrade`.
Dependencies already at their latest compatible release remain unchanged in
the lock file.

Notable locked upgrades: FastAPI 0.143.0, Pydantic 2.14.0 / pydantic-core 2.50.0,
SQLAlchemy 2.1.4, aiohttp 3.14.5, Uvicorn 0.54.0, uvloop 0.23.0 and Ruff 0.17.0.
Docker and local bootstrap use uv 0.13.0; the build backend requires uv_build
0.13.0. The Ruff pre-commit hook is also pinned to 0.17.0.

The latest aioboto3 (15.5.0) requires aiobotocore 2.25.1, which constrains boto3
and botocore to 1.40.61. Updating them independently to PyPI's newest releases
would break dependency resolution. AWS SDK type stubs were aligned to this
runtime minor (boto3-stubs 1.40.76, mypy-boto3-s3 1.40.61).

The media smoke script now explicitly types the decoded ffprobe streams, and
one existing test was reformatted for the new Ruff version. No application
behavior or database models changed.

## Validation

- `uv sync --locked` completed successfully.
- Ruff lint and format checks passed; mypy passed for all 72 checked files.
- Full local pytest run with `--require-docker -n 4 --cov=src --cov-branch
  --cov-fail-under=85`: 926 passed, 3 skipped; coverage 88.41%.
- Built `Dockerfile.backend --target test` and repeated the full suite inside
  the production media environment with the same Docker requirement and
  coverage gate: 926 passed, 3 skipped; coverage 88.41%.
- The three skips are existing explicit markers: photo deletion (`FIx later`)
  and two schema tests (`This test seems redundant`). No Docker-dependent
  tests were skipped for missing infrastructure.
- Image build checks passed for native JPEG orientation, PNG, AVIF, ICC,
  FFprobe, H.264/AAC transcoding, remuxing and video posters.
- All pre-commit hooks passed on changed files. Running them across the whole
  repository also found pre-existing whitespace issues outside this update;
  those unrelated changes were excluded.

## Live HTTP verification

An isolated PostgreSQL 17, RustFS 1.0.1 and Valkey 9 stack was used with a live
Uvicorn server and a separate Celery worker, without API/dependency mocks.
A fresh database was upgraded to Alembic head; `alembic check` reported
`No new upgrade operations detected.`

Verified registration and login, unauthenticated access rejection, creation of
an empty project and a gallery, project search/sort, gallery rename, presigned
JPEG upload to S3, upload confirmation, Celery processing, and fetching the
resulting AVIF thumbnail. A password-protected gallery share returned 401
before unlock, 204 on unlock and 200 afterwards. Public and private download
endpoints returned 303 redirects. Refresh-token rotation, the admin login page,
OpenAPI and metrics returned successful responses.

This verification uses HTTP requests; it does not claim a visual browser review
of the frontend.
