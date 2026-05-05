# Projects and Galleries

Viewport now runs in a project-first mode:

- **Project** = photographer-facing parent container
- **Gallery** = the internal upload/photo unit that always lives inside a project

This keeps the existing upload/photo pipeline gallery-based while making **projects** the only top-level concept in the product.

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

The canonical nested public route is:

- `GET /s/{share_id}/galleries/{gallery_id}`

Legacy folder-named public aliases have been removed; project shares use gallery routes only.

Shared project UX is gallery-tab based:

- opening `/share/{share_id}` for a project automatically opens the first listed gallery
- the public hero stays project-scoped: it keeps the project title and uses the cover from the leftmost listed gallery
- the public page renders a horizontal list of gallery names
- no preview cards are shown for project navigation

### Hidden galleries

For `project_visibility = "direct_only"`:

- the gallery is **not shown** in project share responses
- the gallery is **not reachable** through `/s/{project_share_id}/galleries/{gallery_id}`
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
- `POST /projects/{project_id}/galleries`

Project share management:

- `GET /projects/{project_id}/share-links`
- `POST /projects/{project_id}/share-links`
- `PATCH /projects/{project_id}/share-links/{sharelink_id}`
- `DELETE /projects/{project_id}/share-links/{sharelink_id}`

Creation semantics are project-first:

- `POST /projects` creates an empty project; galleries are added explicitly with `POST /projects/{project_id}/galleries`
- `POST /galleries` remains a compatibility entrypoint and now auto-wraps the created gallery into a new one-gallery project

Gallery endpoints still work and now accept project placement fields where relevant.

## Frontend surfaces

- `DashboardPage.tsx` shows **Projects** only
- creating a project starts with an empty project; galleries are added explicitly from the project surface
- `ProjectPage.tsx` remains the owner surface for project metadata, gallery visibility/order, and project-scoped share links
- project gallery visibility and ordering are managed from in-card actions; order is persisted via `project_position`
- when project share links already have active or submitted selection sessions, risky changes (hide as `direct_only`, delete gallery, reorder gallery) warn the owner before proceeding
- `GalleryPage.tsx` remains photo-first for gallery-level work, but its canonical owner route is `/projects/{project_id}/galleries/{gallery_id}`
- the legacy owner route `/galleries/{gallery_id}` still works and redirects into the owning project when possible
- `PublicGalleryPage.tsx` now renders either:
  - a gallery share page with photos, or
  - a project share page that opens the first listed gallery, keeps a project-scoped hero, renders a horizontal list of gallery names, and keeps a sticky selection bar visible during proofing

## Selection and favorites

- Selection stays **sharelink-scoped**
- A gallery share link still runs selection only inside that gallery
- A project share link can now run **one shared selection flow across all listed galleries** in the project
- `direct_only` galleries stay excluded from project selection
- Project selection owner detail groups selected photos by gallery and CSV/plain-text exports include **gallery context** for each selected photo

## Backward compatibility

- Existing standalone galleries are backfilled into projects with one gallery each
- Existing gallery share links are preserved as `scope_type = "gallery"`
- Gallery-scoped selection/favorites remains unchanged
- Project shares can now expose selection flows without creating per-gallery proofing links

## Migration notes

The migration chain for this feature is:

- parent revision: `9c4a7e2b1d3f`
- project/gallery/share-scope revision: `f1a2b3c4d5e6`

If a local development database still points at an old deleted revision, re-align it before running checks:

```bash
alembic stamp --purge 9c4a7e2b1d3f
alembic upgrade head
alembic check
```

Use this only for local history repair, never for shared environments.
