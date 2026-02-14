# Copilot instructions (Viewport)

## Big picture
- Monorepo: FastAPI backend in `src/viewport/` + React/Vite frontend in `frontend/`.
- Backend layers: routers in `src/viewport/api/` → repository layer in `src/viewport/repositories/` (SQLAlchemy `Session`) → Postgres models in `src/viewport/models/`.
- Storage/URLs: originals + thumbnails live in S3-compatible storage (rustfs). Backend generates presigned URLs and caches them **in-process** (see `src/viewport/cache_utils.py`).
- Background work: Celery tasks in `src/viewport/background_tasks.py` create thumbnails after uploads; Docker Compose runs a separate `celery_worker`.
- uv is used as package manager.

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
  - **Two-step upload**:
    1. `/batch-presigned`: Creates `PENDING` DB records and returns presigned PUT URLs. Client uploads directly to S3.
    2. `/batch-confirm`: Verifies upload by applying `upload-status: confirmed` tag to S3 objects.
  - **Confirmation logic**: Existence check is performed via `put_object_tagging`. `NoSuchKey` errors result in `FAILED` status. Successful tagging triggers Celery thumbnail batches.
  - **Presigned URLs**: Avoid generating presigned URLs during batch upload; fetch URLs separately via `/photos/urls` endpoints.
  - **Garbage collection**: A Celery beat task (`cleanup_orphaned_uploads`) runs hourly to delete `PENDING` photo records older than 30 minutes and their corresponding S3 objects to prevent storage leaks from unconfirmed uploads.
  - **Gallery deletion**: `galleries.is_deleted` is a soft-delete flag. Deleting a gallery hides it from queries and enqueues a background task to purge S3 objects and hard-delete DB rows.
  - **Storage quotas**: User storage is tracked on `users` (`storage_quota`, `storage_used`, `storage_reserved`). Reserve bytes on `/batch-presigned`, finalize on confirm, and release on failures/orphan cleanup; only admins edit quota via SQLAdmin.
- No direct SQL in routers; use repositories for all DB access.

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
- **Themes**: Light/dark themes are configured via CSS variables in `frontend/src/index.css` (primarily in the `:root` and `html.dark` selectors). Theme toggled via `themeStore` and persisted in `localStorage`. Every new feature should support both themes and have good contrast in each.
- **Styling and theme maintenance**: Keep Tailwind dark-mode working off the `html` class that `themeStore` manages (no ad-hoc `theme === 'dark'` branches inside components). Define semantic color tokens in `frontend/src/index.css` via `@theme`/custom vars and use the generated utilities (`bg-surface`, `text-text`, `text-muted`, `bg-surface-foreground`, etc.) with `dark:` variants instead of hardcoding RGB values. When tweaking tokens (like `--color-surface-foreground-rgb`), follow the existing RGB palettes to keep light- and dark-theme surfaces consistent, and let the Tailwind utilities adapt automatically.

## Migrations / tests / lint
- Alembic: config `alembic.ini`, migrations in `src/viewport/alembic/`. Create revisions with `alembic revision --autogenerate -m "..."`.
- Backend checks:
  - Format + autofix: `just pretty` / `make pretty` (Ruff).
  - Typecheck: `just mypy`.
  - Tests: `just test` (pytest-xdist `-n 4`), coverage gate in `just test-cov` (fail-under 85).
- Frontend checks: `cd frontend && npm run lint && npm run test:run`.

## Gotchas worth keeping in mind
- Presigned URL cache is **not Redis-backed**; it’s per-process memory. Don’t assume cross-worker cache coherence.

## Important rules
- When making significant changes in the project, update this file to reflect new conventions or architectural patterns.
