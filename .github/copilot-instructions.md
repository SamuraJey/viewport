# Copilot instructions (Viewport)

## Big picture
- Monorepo: FastAPI backend in `src/viewport/` + React/Vite frontend in `frontend/`.
- Backend layers: routers in `src/viewport/api/` → repository layer in `src/viewport/repositories/` (SQLAlchemy `Session`) → Postgres models in `src/viewport/models/`.
- Backend database access uses SQLAlchemy `AsyncSession` in app code, repositories, and auth dependencies, while Celery background tasks currently use a sync SQLAlchemy `Session` via `task_db_session()`.
- Storage/URLs: originals + thumbnails live in S3-compatible storage (rustfs). Backend generates presigned URLs and caches them in Redis (ValKey) for cross-worker coherence (see `src/viewport/cache_utils.py` + `src/viewport/redis_client.py`).
- uv is used as package manager.

## How to run (preferred workflows)
- Containers (recommended): `docker-compose up -d` (services: backend, postgres, rustfs, redis, celery_worker).
- Backend local tooling uses `uv` + venv via `just init` or `make init` (see `Justfile`, `Makefile`).
- Backend dev server (preferred local dev): `uvicorn viewport.main:app --reload`.
  - Note: Docker commands use `src.viewport.*` module paths (see `Dockerfile.backend`, `docker-compose.yml`).
- Frontend dev server: `cd frontend && npm install && npm run dev`.

## Backend conventions (FastAPI)
- App entrypoint: `src/viewport/main.py`.
  - Initializes a singleton `AsyncS3Client` in `lifespan()` and exposes it via DI (`src/viewport/dependencies.py`).
- Auth: endpoints in `src/viewport/api/auth.py`; request auth uses `get_current_user()` from `src/viewport/auth_utils.py` (HTTP Bearer, consistent 401s).
- Repositories:
  - Constructed per-request from `db: AsyncSession = Depends(get_db)` (`src/viewport/models/db.py`).
  - Keep business logic close to repository methods when it’s DB/S3 orchestration (e.g. async delete/rename in `GalleryRepository`).
  - Private gallery photo listing (`GET /galleries/{gallery_id}`) supports query params `search`, `sort_by`, and `order`; repository methods must apply filters inside `gallery_id` with `galleries.is_deleted = false`, and `total_photos` must reflect filtered results.
  - Shared gallery photo listing (`GET /s/{share_id}`) uses gallery-level persisted settings (`galleries.public_sort_by`, `galleries.public_sort_order`) configured in private gallery management; sorting and pagination must be done at SQL level and `total_photos` must represent full gallery size before pagination.
  - Share links support lifecycle controls (`share_links.label`, `share_links.is_active`, editable `expires_at`) and owner-scoped management endpoints (`/galleries/{gallery_id}/share-links`, `/share-links`).
  - Share-link analytics are stored as daily aggregates in `share_link_daily_stats` with dedup support via `share_link_daily_visitors` (hash of IP+User-Agent); do not add raw per-open event logs unless explicitly required.
  - Public share access: inactive links must remain non-disclosing (`404`), while expired links return `410` so frontend can render a dedicated expiration state.
- Photo upload performance pattern:
  - **Two-step upload**:
    1. `/batch-presigned`: Creates `PENDING` DB records and returns presigned PUT URLs. Client uploads directly to S3.
    2. `/batch-confirm`: Verifies upload by applying `upload-status: confirmed` tag to S3 objects.
  - **Confirmation logic**: `/batch-confirm` transitions photos from `PENDING` to `THUMBNAIL_CREATING`, finalizes reserved quota, and enqueues thumbnail generation. Thumbnail workers move records to `SUCCESSFUL` on metadata/thumbnail success or to `FAILED` on permanent errors.
  - **Presigned URLs**: Avoid generating presigned URLs during batch upload; fetch URLs separately via `/photos/urls` endpoints.
  - **Garbage collection**: A Celery scheduled task (`cleanup_orphaned_uploads`) runs hourly to delete `PENDING` photo records older than 30 minutes and their corresponding S3 objects to prevent storage leaks from unconfirmed uploads.
  - **Gallery deletion**: `galleries.is_deleted` is a soft-delete flag. Deleting a gallery hides it from queries and enqueues a background task to purge S3 objects and hard-delete DB rows.
  - **Storage quotas**: User storage is tracked on `users` (`storage_quota`, `storage_used`, `storage_reserved`). Reserve bytes on `/batch-presigned`, finalize on confirm, and release on failures/orphan cleanup; only admins edit quota via SQLAdmin.

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
  - Theme preference is persisted under `localStorage['theme-preference']` with values `light|dark|system`.
  - Auth header is injected from `authStore`, and 401 triggers refresh via `/auth/refresh`.
- **API calls**: Live in `frontend/src/services/*Service.ts` and use shared Axios instance `frontend/src/lib/api.ts`.
  - Demo environment: `frontend/src/services/demoService.ts` is the in-memory source of truth for demo data. Service methods should branch through `isDemoModeEnabled()` (`frontend/src/lib/demoMode.ts`) so Dashboard/Gallery/Profile/Public flows can run without backend auth.
  - Demo entry points: use one-click demo access from auth/landing UI by enabling demo mode in localStorage (`viewport-demo-mode`) and logging into `authStore` with mock user/tokens.
- **Dev API routing**: Vite proxy rewrites `VITE_DEV_API_PREFIX` (default `/api`) to the backend (see `frontend/vite.config.ts`).
- **Pages**: In `frontend/src/pages/`, use custom hooks for pagination/selection/modals instead of manual state (see DashboardPage.tsx, GalleryPage.tsx for examples).
  - Share links management UI spans `GalleryPage.tsx` (local section with inline edit actions), `ShareLinksDashboardPage.tsx` (owner-wide table), and `ShareLinkDetailPage.tsx` (time-series analytics + edit/delete controls).
  - Keep pages as orchestration layers and prefer route-level lazy loading (`React.lazy` + `Suspense`) in `frontend/src/App.tsx` for main page components to control bundle size.
  - `GalleryPage.tsx` follows a **photo-first** layout: compact metadata header and primary focus on the photo grid. Upload starts directly from `Add Photos` (file picker), and drag-and-drop is handled across the whole gallery page instead of a permanently large uploader block.
  - In `GalleryPage.tsx`, keep private gallery controls (`search`, `sort_by`, `order`) URL-synced via query params, debounce search input before updating URL/API calls, and reset pagination to page `1` whenever these controls change.
  - Public gallery sorting is not user-adjustable in `PublicGalleryPage.tsx`; photographer-configured settings are edited in private gallery and persisted on the gallery model.
  - For large page/modals, prefer feature-local decomposition into focused presentation components under dedicated folders (e.g. `components/public-gallery/`, `components/dashboard/`, `components/profile/`, `components/upload-confirm/`, `components/auth/`) while keeping orchestration in page/container components.
- **Themes**: Light/dark themes are configured via CSS variables in `frontend/src/index.css` (primarily in the `:root` and `html.dark` selectors). Theme toggled via `themeStore`; first visit follows `prefers-color-scheme`, and explicit user toggles override system by persisting `theme-preference` in `localStorage`. Every new feature should support both themes and have good contrast in each.
- **Styling and theme maintenance**: Keep Tailwind dark-mode working off the `html` class that `themeStore` manages (no ad-hoc `theme === 'dark'` branches inside components). Define semantic color tokens in `frontend/src/index.css` via `@theme`/custom vars and use the generated utilities (`bg-surface`, `text-text`, `text-muted`, `bg-surface-foreground`, etc.) with `dark:` variants instead of hardcoding RGB values. When tweaking tokens (like `--color-surface-foreground-rgb`), follow the existing RGB palettes to keep light- and dark-theme surfaces consistent, and let the Tailwind utilities adapt automatically.

## Migrations / tests / lint
- Alembic: config `alembic.ini`, migrations in `src/viewport/alembic/`. Create revisions with `alembic revision --autogenerate -m "..."`.
- **Migration workflow (required)**:
  1. Ensure local DB is at head: `alembic upgrade head`.
  2. Make model changes.
  3. Generate migration: `alembic revision --autogenerate -m "..."`.
  4. Validate generated revision contains only intended business changes.
  5. Run `alembic check` (must report `No new upgrade operations detected.`).
  6. Run migration tests: `pytest tests/test_migrations.py` (or `just test` for full suite).
  7. For local history rewrites only (never shared history), re-align DB revision pointer with `alembic stamp --purge <revision>`.
- **Autogenerate notes**:
  - `src/viewport/alembic/env.py` contains filtering for a known false-positive FK diff on `photos_gallery_id_fkey`; do not add cleanup scripts for this.
  - Keep cyclical FK metadata stable by using `use_alter=True` on `Gallery.cover_photo_id` FK to `photos.id`.
- Backend checks:
  - Format + autofix: `just pretty` / `make pretty` (Ruff).
  - Typecheck: `just mypy`.
  - Tests: `just test` (pytest-xdist `-n 4`), coverage gate in `just test-cov` (fail-under 85).
- Frontend checks: `cd frontend && npm run lint -- --fix && npm run test:run`.

## Gotchas worth keeping in mind
- Presigned URL cache is Redis-backed with a TTL buffer (URL TTL minus 10 minutes). Redis outages should degrade gracefully to direct presign generation without failing requests.

## Important rules
- When making significant changes in the project, update this file to reflect new conventions or architectural patterns.
- Documentations must be put in docs/ folder.
