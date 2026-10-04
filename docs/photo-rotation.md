# Photo rotation

Photographers can rotate successful JPEG/PNG images by 90° clockwise or
counterclockwise from the photo card, the private lightbox, or the selection
toolbar. Videos and unfinished uploads are excluded from rotation. Mixed
selections show the number of eligible images; selection and navigation stay
unchanged. Card overflow menus retain cover, rename and delete actions and add
**Reset orientation** (the orientation of the uploaded source, not necessarily
EXIF orientation 1).

## Interaction and delivery

- Edits autosave after 300 ms; rapid turns coalesce to an absolute angle.
- Optimistic previews are generated from thumbnails with at most four browser
  jobs, not from full originals. Cards and the private lightbox fall back to a
  fitted CSS rotation of the thumbnail when Canvas/CORS is unavailable. Object
  URLs are revoked when no longer needed; full-resolution zoom returns after
  publication.
- A ten-second Undo action restores the previous angle of each edited photo.
- Pending/processing cards show **Saving rotation**; permanent failures retain
  the published image and expose **Retry**.
- The owner polls pending edits every two seconds while the tab is visible.
  Gallery-level pending counts allow completion detection after pagination or
  reload. Completion refreshes cover metadata without a full-screen loader.
- Private single/selected/full-gallery downloads are disabled while relevant
  edits are pending. A metadata preflight supplies an actionable error, and
  the backend also rejects pending downloads with 409. Files still download
  through browser forms/redirects, never JavaScript fetches from storage.
- Public pages and downloads use the last successfully published version while
  a new edit processes. Completed versions apply to thumbnails, lightboxes,
  gallery/project covers, individual downloads and ZIP entries.
- Demo mode follows the same revision, media eligibility and reset behavior.
  Its sample images are rendered through browser Canvas as JPEG at quality 0.85
  and stored as data URLs (ordinary optimistic previews remain PNG);
  this is an offline UI simulation, not the production JPEG processing path.

## API and persistence

`PATCH /galleries/{gallery_id}/photos/rotation` accepts 1–500 unique items:

```json
{
  "items": [
    {"photo_id": "<uuid>", "rotation": 90, "expected_revision": 0}
  ]
}
```

Angles are 0/90/180/270 relative to the EXIF-normalized uploaded source. Each
accepted item increments `rotation_revision`, sets `requested_rotation`, and
persists `rotation_status = pending` before enqueueing work. Owner/gallery
validation and version checks happen under row locks. Partial results return
`not_found`, `not_ready`, or `conflict`, with current photo metadata where
available. Repeating a stale request returns conflict instead of applying an
additional relative turn.

`GET /galleries/{gallery_id}/photos/rotation?photo_ids=<uuid>&photo_ids=<uuid>`
returns up to 500 current photo states and `pending_rotation_count`. An empty
ID list returns the gallery count only. Foreign/deleted galleries return 404;
foreign photo IDs never disclose photo metadata. Private listing responses
include the same rotation fields; public URLs already represent the published
orientation. The frontend splits status reads into at most 100 IDs per request
to keep query strings within proxy URL limits.

Photo columns:

- `rotation`: successfully published angle; defaults to 0.
- `requested_rotation`: latest accepted target angle.
- `rotation_revision`: monotonically increasing edit version.
- `rotation_status`: `ready | pending | processing | failed`.
- `rotation_error`, `rotation_updated_at`: recovery/UI state.
- `rotated_object_key`: published delivery derivative, or null for the source.

`object_key`, upload status, file size, upload time and reserved/used quota are
not changed by rotation. Only the uploaded original counts toward quota.

## Worker and losslessness

`rotate_photo` runs on the existing bounded photo queue. Originals stream into
an anonymous `TemporaryFile`; JPEG staging copies are disk-to-disk. Do not add
full-original byte buffers or Pillow transforms to this pipeline.

JPEG edits use ExifTool to compose all eight EXIF orientations with the requested
quarter-turn. IFD0 and XMP orientation are updated, and the obsolete embedded
thumbnail is removed. Compressed JPEG pixels are unchanged, including after
multiple turns/reset; clients must honor EXIF orientation. PNG edits use libvips
autorotation plus lossless pixel rotation, preserving alpha and metadata. Every
edit is derived from the source, never from an earlier edited file. AVIF
thumbnails use the existing libvips thumbnail implementation and memory limits.

Uploads use immutable revision/attempt-specific keys:

```text
<gallery_id>/<photo_id>_rotations/<revision>-<attempt>/image.jpg|png
<gallery_id>/<photo_id>_rotations/<revision>-<attempt>/thumbnail.avif
```

The worker atomically publishes only if its revision is still current and
processing. URLs, dimensions, angle and status change together. Dimensions are
read from the full delivery image with EXIF orientation applied, not from the
resized thumbnail; reset reads them from the uploaded source. Explicit
gallery/project cover focal points rotate in that transaction. A superseded
task cannot overwrite a newer edit. Reset switches delivery back to the
original and generates a fresh thumbnail. Versioned keys avoid stale CDN/browser
and presigned-cache content; published objects are never overwritten.

Transient failures retry up to three times; failures do not alter upload status
or quota. The minute reconciler re-enqueues edits pending for over ten minutes
after broker failure and recovers processing leases older than 35 minutes (beyond the worker's
30-minute hard limit). Run Celery Beat for this recovery path.

Hourly cleanup removes only unreferenced rotation objects older than three hours
and protects all versions of recently changed photos for three hours after
supersession, covering the two-hour presigned URL lifetime plus a buffer. Photo
deletion purges its exact rotation prefix; gallery deletion already purges the
whole gallery prefix.

## Deployment and verification

Apply Alembic revision `1174ab994e82`, rebuild backend/photo-worker containers
(runtime requires `libimage-exiftool-perl`, now in `Dockerfile.backend`) and
restart workers/Beat alongside the backend. Local workers need `exiftool` on
PATH as well as the existing libvips dependencies.

The Python CI job runs inside `Dockerfile.backend --target test`, sharing the
production ExifTool, libvips, FFmpeg and AVIF runtime packages. Image build checks
exercise JPEG tooling and actual PNG/AVIF encoding before pytest. Changes to
`.github/workflows/ci.yml` trigger the backend jobs too. Rotation tests require
the native dependencies: missing ExifTool/libvips fails CI, while local native
tests skip if the tools are unavailable. Worker orchestration tests stub native
processing separately from the full-dimension and losslessness checks.
See [Backend CI](backend-ci.md) for Testcontainers networking, coverage export
and a local container test command.

For local Debian/Ubuntu tests, install the same packages before syncing Python
dependencies:

```sh
sudo apt-get update
sudo apt-get install -y --no-install-recommends libimage-exiftool-perl libvips-dev pkg-config
uv sync --frozen
```

`tests/test_photo_rotation.py` covers all EXIF orientations, byte-preserving JPEG
edits, anonymous temporary sources, lossless RGBA PNG, authorization/revisions,
atomic publication, cover focal points, worker failure/reset/quota, retained
versions and private/public delivery. Frontend hook/service tests cover rapid
clicks, in-flight edits, mixed selection, Undo, stale responses and download
preflight. Run migration upgrade/downgrade tests and `alembic check` too.
