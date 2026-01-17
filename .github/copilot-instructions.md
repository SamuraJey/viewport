# Copilot instructions (Viewport)

## Big picture
- Monorepo: FastAPI backend in `src/viewport/` + React/Vite frontend in `frontend/`.
- Backend layers: routers in `src/viewport/api/` → repository layer in `src/viewport/repositories/` (SQLAlchemy `Session`) → Postgres models in `src/viewport/models/`.
- Storage/URLs: originals + thumbnails live in S3-compatible storage (rustfs). Backend generates presigned URLs and caches them **in-process** (see `src/viewport/cache_utils.py`).
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
- **Type system**: Centralized in `frontend/src/types/` (common.ts, gallery.ts, photo.ts, sharelink.ts, auth.ts).
  - Services re-export types for backward compatibility but new code should import from `types/`.
  - Use `PaginatedResponse<T>`, `ApiError`, `AsyncState<T>` for consistent patterns.
- **Custom hooks** in `frontend/src/hooks/`:
  - `usePagination`: URL-synced pagination state (page, pageSize, total) with goToPage/nextPage/previousPage methods. **Don't include the whole pagination object in dependency arrays**—use specific values (pagination.page, pagination.setTotal) to avoid infinite loops.
  - `useSelection`: Multi-select state with Shift+click range selection (selectedIds Set, toggle/selectRange/selectAll methods).
  - `useModal`: Generic modal state (isOpen, data, open/close methods).
  - `useErrorHandler`: Centralized error handling (error, clearError, handleError).
- **State management**: Zustand stores in `frontend/src/stores/` (authStore, themeStore).
  - Theme uses **themeStore only** (ThemeContext was removed). Access via `useThemeStore()` hook.
  - Auth header is injected from `authStore`, and 401 triggers refresh via `/auth/refresh`.
- **API calls**: Live in `frontend/src/services/*Service.ts` and use shared Axios instance `frontend/src/lib/api.ts`.
- **Dev API routing**: Vite proxy rewrites `VITE_DEV_API_PREFIX` (default `/api`) to the backend (see `frontend/vite.config.ts`).
- **Pages**: In `frontend/src/pages/`, use custom hooks for pagination/selection/modals instead of manual state (see DashboardPage.tsx, GalleryPage.tsx for examples).
- **Themes**: Light/dark themes in `frontend/src/themes/` (CSS variables). Theme toggled via `themeStore` and persisted in `localStorage`. Every new feature should support both themes and have good contrast in each.

## Migrations / tests / lint
- Alembic: config `alembic.ini`, migrations in `src/viewport/alembic/`. Create revisions with `alembic revision --autogenerate -m "..."`.
- Backend checks:
  - Format + autofix: `just pretty` / `make pretty` (Ruff).
  - Typecheck: `just mypy`.
  - Tests: `just test` (pytest-xdist `-n 4`), coverage gate in `just test-cov` (fail-under 85).
- Frontend checks: `cd frontend && npm run lint && npm run test:run`.

## Gotchas worth keeping in mind
- Presigned URL cache is **not Redis-backed**; it’s per-process memory. Don’t assume cross-worker cache coherence.
