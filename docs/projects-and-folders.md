# Projects and Folders

Viewport now supports a two-level organization model:

- **Project** = photographer-facing parent container
- **Gallery** = folder inside a project, or a standalone folder when `project_id` is `null`

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

### Gallery as folder

`galleries` remains the upload unit and now also stores project placement:

- `project_id`
- `project_position`
- `project_visibility`

`project_visibility` values:

- `listed` — folder is visible inside a project share
- `direct_only` — folder is hidden from project shares and only accessible through its own direct share link

## Share scopes

`share_links` now supports two scopes:

- `scope_type = "gallery"` — direct link to one folder
- `scope_type = "project"` — link to the whole project

Only one target is allowed per share link:

- gallery scope: `gallery_id != null` and `project_id == null`
- project scope: `project_id != null` and `gallery_id == null`

## Public visibility rules

### Folder share

`GET /s/{share_id}` returns a folder/gallery response with photos.

### Project share

`GET /s/{share_id}` returns a project response with listed folders only.

`GET /s/{share_id}/folders/{folder_id}` opens a folder from the project share only when that folder is `listed`.

### Hidden folders

For `project_visibility = "direct_only"`:

- the folder is **not shown** in project share responses
- the folder is **not reachable** through `/s/{project_share_id}/folders/{folder_id}`
- the folder **is reachable** through its own direct gallery share link

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

- `DashboardPage.tsx` shows **Projects** and **Standalone folders**
- `ProjectPage.tsx` manages project folders and project share links
- `GalleryPage.tsx` remains photo-first for folder-level work
- `PublicGalleryPage.tsx` now renders either:
  - a folder share page with photos, or
  - a project share page with listed folders

## Backward compatibility

- Existing gallery share links are preserved as `scope_type = "gallery"`
- Selection/favorites remains **gallery-scope only**
- Project shares do not expose selection flows

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
