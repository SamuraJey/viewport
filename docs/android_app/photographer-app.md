# Viewport Android Photographer App

_Last updated: 2026-05-09_

This document describes the native Android implementation added under `android/`. It is intentionally scoped to the photographer/owner side of Viewport and does **not** implement PublicGallery, public `/s/*` consumption, public selection/favorites, or client-facing deep-link flows.

## Scope implemented

Owner-facing functionality:

- invite-code registration, login, logout, token refresh, session restore
- profile display/update, storage quota display, password change
- project list/search/sort, project create/update/delete, project ZIP download
- project detail with gallery list, gallery create/delete, gallery visibility toggle
- gallery detail with uploaded photo grid, photo preview, search, rename, delete, cover selection, individual photo download, gallery ZIP download
- Android Photo Picker upload into a gallery through the backend two-step direct-to-S3 flow
- gallery- and project-scoped share-link create/toggle/delete plus owner-wide link list
- copy public share URL for a managed share link
- mobile-friendly photo loading fallback: gallery tiles try the AVIF thumbnail first and automatically fall back to the original image if the thumbnail cannot be decoded or fetched; unreachable `localhost`/internal S3 URLs show an explicit error hint instead of a blank card

Explicitly excluded from this Android app iteration:

- PublicGallery/public project share browsing (`/share/*` UI and backend `/s/*` API consumption)
- public unlock cookies, public download flows, favorites/selection participation
- owner analytics/detail charts and selection export/management
- CameraX capture, local image compression/transcoding, offline sync

## Android architecture

- Project root: `android/`
- Package: `com.example.viewport`
- UI: Kotlin + Jetpack Compose + Material 3
- State: a single `ViewportViewModel` with `StateFlow<AppUiState>` for the first implementation slice
- Network: Retrofit + OkHttp + Gson in `data/network/ViewportApiClient.kt`
- Auth persistence: Preferences DataStore in `data/auth/AuthSessionStore.kt`
- Upload background work: WorkManager `PhotoUploadWorker`
- Image loading: Coil Compose
- Downloads: Android `DownloadManager` for owner ZIP endpoints and individual presigned photo URLs

Main file map:

| Area | Files |
| --- | --- |
| App bootstrap | `ViewportApp.kt`, `AppContainer.kt`, `MainActivity.kt` |
| View model/state | `ViewportViewModel.kt` |
| Compose screens | `ui/ViewportScreens.kt` |
| Retrofit contract | `data/api/ViewportApi.kt`, `data/api/ViewportDtos.kt` |
| Session/auth | `data/auth/AuthSessionStore.kt`, `data/network/ViewportApiClient.kt` |
| Repository facade | `data/repository/ViewportRepository.kt` |
| Upload worker | `worker/PhotoUploadWorker.kt` |

## Backend/API notes

The Android app uses the backend root URL directly, not the Vite `/api` proxy. Build config defaults are:

- debug: `http://192.168.1.50:8000` for the current physical-phone LAN workflow
- release: `https://backend.samuraj.su`

Photo thumbnails/full images are loaded from backend-generated S3/RustFS presigned URLs. In Docker, keep `S3_ENDPOINT=http://s3-service:9000` for backend-to-RustFS traffic, but set `S3_PUBLIC_ENDPOINT` to the address reachable by the Android device:

- emulator: `S3_PUBLIC_ENDPOINT=http://10.0.2.2:9000`
- physical phone on LAN: `S3_PUBLIC_ENDPOINT=http://<developer-machine-lan-ip>:9000`

The backend includes the presign endpoint in its Redis cache namespace, so changing `S3_PUBLIC_ENDPOINT` and restarting the backend bypasses stale `localhost`/`s3-service` presigned URLs immediately. If a previously installed app still shows blank images, force-refresh the gallery screen after the backend restart so it fetches a fresh gallery payload.

Owner downloads needed mobile-friendly authenticated GET endpoints because `DownloadManager` can attach a Bearer header but cannot post a JSON body conveniently:

- `GET /galleries/{gallery_id}/download/all` — alias of the existing owner gallery ZIP download flow; the existing POST route remains for compatibility.
- `GET /projects/{project_id}/download/all` — new owner project ZIP stream. It includes all non-deleted galleries in the project, including `direct_only` galleries, because this is an owner download.

Upload mirrors the existing web/backend contract:

1. `POST /galleries/{gallery_id}/photos/batch-presigned` creates pending photo rows and returns presigned S3 PUT data.
2. `PhotoUploadWorker` streams the picked `content://` URI to S3 using the returned URL/headers.
3. `POST /galleries/{gallery_id}/photos/batch-confirm` marks successful uploads confirmed and failed uploads failed.

The worker currently accepts `image/jpeg`, `image/jpg`, and `image/png`, max 10 MB per file, matching the backend constraints.

## Running locally

```bash
cd android
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

For an emulator talking to a local backend, set the debug `API_BASE_URL` to `http://10.0.2.2:8000` and run the FastAPI backend on the host. For a physical phone, keep the debug `API_BASE_URL` and `S3_PUBLIC_ENDPOINT` on the same machine-reachable LAN host (currently `192.168.1.50`).

## Verification coverage added

- Android debug APK builds through `:app:assembleDebug` and lint passes through `:app:lintDebug`.
- JVM unit tests in `ViewportDtosTest` verify critical Gson field names for backend DTO compatibility.
- Backend tests cover:
  - mobile GET alias for whole-gallery ZIP downloads with Bearer auth
  - whole-project ZIP downloads with listed + direct-only owner galleries
  - empty-project download 404 behavior
