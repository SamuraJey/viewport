# Projects and Galleries

Viewport now supports a two-level organization model:

- **Project** = photographer-facing parent container
- **Gallery** = gallery inside a project, or a standalone gallery when `project_id` is `null`

This keeps the existing upload/photo pipeline gallery-based while adding project-level grouping and sharing.

## Core model

### Project

`projects` stores:

- `id`
- `owner_id`
- `name`
- `created_at`
- `shooting_date`
- `is_deleted`

### Gallery placement inside a project

`galleries` remains the upload unit and now also stores project placement:

- `project_id`
- `project_position`
- `project_visibility`

`project_visibility` values:

- `listed` — gallery is visible inside a project share
- `direct_only` — gallery is hidden from project shares and only accessible through its own direct share link

## Share scopes

`share_links` now supports two scopes:

- `scope_type = "gallery"` — direct link to one gallery
- `scope_type = "project"` — link to the whole project

Only one target is allowed per share link:

- gallery scope: `gallery_id != null` and `project_id == null`
- project scope: `project_id != null` and `gallery_id == null`

## Public visibility rules

### Gallery share

`GET /s/{share_id}` returns a gallery response with photos.

### Project share

`GET /s/{share_id}` returns a project response with listed galleries only.

`GET /s/{share_id}/folders/{folder_id}` opens a gallery from the project share only when that gallery is `listed`.

Shared project UX is gallery-tab based:

- opening `/share/{share_id}` for a project automatically opens the first listed gallery
- the public hero stays project-scoped: it keeps the project title and uses the cover from the leftmost listed gallery
- the public page renders a horizontal list of gallery names
- no preview cards are shown for project navigation

### Hidden galleries

For `project_visibility = "direct_only"`:

- the gallery is **not shown** in project share responses
- the gallery is **not reachable** through `/s/{project_share_id}/folders/{folder_id}`
- the gallery **is reachable** through its own direct gallery share link

### Link lifecycle semantics

Existing public behavior stays unchanged for both scopes:

- inactive link → `404`
- expired link → `410`

## Owner API

Project management:

- `POST /projects`
- `GET /projects`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `POST /projects/{project_id}/folders`

Project share management:

- `GET /projects/{project_id}/share-links`
- `POST /projects/{project_id}/share-links`
- `PATCH /projects/{project_id}/share-links/{sharelink_id}`
- `DELETE /projects/{project_id}/share-links/{sharelink_id}`

Gallery endpoints still work and now accept project placement fields where relevant.

## Frontend surfaces

- `DashboardPage.tsx` shows **Projects** and **Standalone galleries**
- `ProjectPage.tsx` manages project galleries and project share links using the same gallery cards as standalone galleries
- project gallery visibility and ordering are managed from in-card actions; order is persisted via `project_position`
- `GalleryPage.tsx` remains photo-first for gallery-level work
- `PublicGalleryPage.tsx` now renders either:
  - a gallery share page with photos, or
  - a project share page that opens the first listed gallery, keeps a project-scoped hero, and renders a horizontal list of gallery names

## Selection and favorites

- Selection stays **sharelink-scoped**
- A gallery share link still runs selection only inside that gallery
- A project share link can now run **one shared selection flow across all listed galleries** in the project
- `direct_only` galleries stay excluded from project selection
- Project selection owner detail and CSV exports include **gallery context** for each selected photo

## Backward compatibility

- Existing gallery share links are preserved as `scope_type = "gallery"`
- Gallery-scoped selection/favorites remains unchanged
- Project shares can now expose selection flows without creating per-gallery proofing links

## Migration notes

The migration chain for this feature is:

- parent revision: `9c4a7e2b1d3f`
- project/folder/share-scope revision: `f1a2b3c4d5e6`

If a local development database still points at an old deleted revision, re-align it before running checks:

```bash
alembic stamp --purge 9c4a7e2b1d3f
alembic upgrade head
alembic check
```

Use this only for local history repair, never for shared environments.
