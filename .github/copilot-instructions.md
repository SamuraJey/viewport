# Copilot instructions (Viewport)

## Big picture
- Monorepo: FastAPI backend in `src/viewport/` + React/Vite frontend in `frontend/`.
- Backend layers: routers in `src/viewport/api/` → repository layer in `src/viewport/repositories/` (SQLAlchemy `Session`) → Postgres models in `src/viewport/models/`.
- Storage/URLs: originals + thumbnails live in S3-compatible storage (rustfs/MinIO). Backend generates presigned URLs and caches them **in-process** (see `src/viewport/cache_utils.py`).
- Background work: Celery tasks in `src/viewport/background_tasks.py` create thumbnails after uploads; Docker Compose runs a separate `celery_worker`.

## How to run (preferred workflows)
- Containers (recommended): `docker-compose up -d` (services: backend, postgres, rustfs, redis, celery).
- Backend local tooling uses `uv` + venv via `just init` or `make init` (see `Justfile`, `Makefile`).
- Backend dev server (preferred local dev): `uvicorn viewport.main:app --reload`.
  - Note: Docker/Celery commands use `src.viewport.*` module paths (see `Dockerfile-backend`, `docker-compose.yml`).
- Frontend dev server: `cd frontend && npm install && npm run dev`.

## Backend conventions (FastAPI)
- App entrypoint: `src/viewport/main.py`.
  - Initializes a singleton `AsyncS3Client` in `lifespan()` and exposes it via DI (`src/viewport/dependencies.py`).
- Auth: endpoints in `src/viewport/api/auth.py`; request auth uses `get_current_user()` from `src/viewport/auth_utils.py` (HTTP Bearer, consistent 401s).
- Repositories:
  - Constructed per-request from `db: Session = Depends(get_db)` (`src/viewport/models/db.py`).
  - Keep business logic close to repository methods when it’s DB/S3 orchestration (e.g. async delete/rename in `GalleryRepository`).
- Photo upload performance pattern:
  - Batch upload endpoint (`src/viewport/api/photo.py`) uploads originals first, batch-inserts DB rows, then schedules Celery thumbnail batches.
  - Avoid generating presigned URLs during batch upload; fetch URLs separately via `/photos/urls` endpoints.

## Frontend conventions (React)
- API calls live in `frontend/src/services/*Service.ts` and use the shared Axios instance `frontend/src/lib/api.ts`.
  - Auth header is injected from Zustand (`frontend/src/stores/authStore.ts`), and 401 triggers refresh via `/auth/refresh`.
- Dev API routing: Vite proxy rewrites `VITE_DEV_API_PREFIX` (default `/api`) to the backend (see `frontend/vite.config.ts`).
- Pages are in `frontend/src/pages/` and tend to manage pagination/UI state locally (example: `frontend/src/pages/GalleryPage.tsx`).

## Migrations / tests / lint
- Alembic: config `alembic.ini`, migrations in `src/viewport/alembic/`. Create revisions with `alembic revision --autogenerate -m "..."`.
- Backend checks:
  - Format + autofix: `just pretty` / `make pretty` (Ruff).
  - Typecheck: `just mypy`.
  - Tests: `just test` (pytest-xdist `-n 4`), coverage gate in `just test-cov` (fail-under 85).
- Frontend checks: `cd frontend && npm run lint && npm run test:run`.

## Gotchas worth keeping in mind
- Presigned URL cache is **not Redis-backed**; it’s per-process memory. Don’t assume cross-worker cache coherence.
