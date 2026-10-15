# Download quality

Downloads offer **Full size** (the default) and **For publishing**. Archive downloads include videos by default; the checkbox controls whether videos are included in either quality. Preferences reset each time the dialog opens. Single videos download directly at original quality.

Full size uses the currently published full-resolution image, including saved lossless rotations; it does not necessarily mean byte-identical to the upload. For publishing uses a separate JPEG, at most 2048 pixels on its long side, without enlarging small images: Q85, progressive, optimized coding, sRGB ICC, no EXIF/GPS/XMP/IPTC or embedded thumbnail. Transparency is composited onto white. The 1000-pixel AVIF remains an interface preview, not a download substitute. Videos always retain their original bytes and filename.

## Estimates and availability

Estimates cover the complete authorized scope, not the current page or search results. Only successful files participate. Selected downloads validate all deduplicated IDs in selection order before filtering unfinished files. Project shares include listed galleries only; direct gallery shares remain usable independently of project visibility.

Original estimates sum uploaded file sizes; publication estimates sum saved JPEG sizes and included original video sizes. ZIP overhead is excluded, and rotated full-resolution files can differ from uploaded sizes. Estimates are approximate, not a promised Content-Length. No per-file S3 HEAD requests are needed.

If any included image lacks its publication JPEG, publication downloads return HTTP 409 (`Publication files are not ready`); full-size downloads remain available. The dialog disables publication and explains that files are unavailable, without promising ongoing preparation. Empty estimates succeed with zero counts; actual empty downloads return 404. Invalid quality/boolean query values return 422. Private downloads/estimates block included pending or processing rotations. Public downloads continue using the previous published assets while rotation is pending or failed.

Owner image cards continue showing retained originals when processing failed or an AVIF preview is missing/unreadable. This is a native, lazy-loaded image fallback, not a change to download quality: healthy cards request only the small preview, video originals are never loaded as poster images, and a missing original terminates at the unavailable state rather than retrying indefinitely. Opening a card still uses the full-resolution lightbox source. The failed-processing badge remains visible until actual processing has succeeded.

Public estimates and HEAD requests use the same share authorization as downloads: inactive/missing links return 404, expired links 410, password protection 401 until unlocked. Neither estimates nor HEAD increment analytics. Actual download requests count once. Public ZIP HEAD and browser GET carry identical quality/video options. Private downloads use POST forms with tokens in the body, never in the URL; JavaScript does not buffer S3 or ZIP bytes.

## Publication lifecycle and backfill

New uploads become successful only after AVIF and JPEG uploads complete. Publication metadata (`publication_object_key`, `publication_file_size`) is recorded atomically. Original storage accounting and quotas are unchanged. Rotation and reset publish full-size, preview, and JPEG together; stale work cannot replace newer revisions. Immutable publication objects use `{gallery_id}/{photo_id}_rotations/{revision}-{uuid}/publication.jpg`. Referenced current JPEGs survive rotation cleanup; unreferenced versions use the existing three-hour retention. Photo/gallery deletion removes publication objects too.

Deploy the database migration (`add publication photo downloads`) before starting workers using the new fields. Apply with `uv run alembic upgrade head`; confirm `uv run alembic check` reports no new upgrade operations. The migration changes schema only: it neither reads S3 nor encodes files. Start updated backend and Celery workers before the first backfill sweep.

The reconciler selects at most 500 successful images in live galleries missing publication metadata, excluding pending/processing rotations. `publication_attempted_at` is marked before enqueue; null/oldest attempts are processed first with an ID tiebreaker. Attempts younger than 35 minutes are excluded, avoiding starvation by repeatedly corrupt originals and allowing recovery after the worker's 30-minute limit or broker failure. Work is queued in existing image microbatches of ten.

Run the existing reconciler once after deployment for an initial wave, or enqueue specific IDs from an application shell:

```python
from viewport.background_tasks import reconcile_successful_uploads_task
from viewport.publication_tasks import create_publication_images_batch_task

reconcile_successful_uploads_task.delay()
create_publication_images_batch_task.delay(["photo-uuid"])
```

Backfill reads the current published delivery key, including saved rotations, and publishes only key/size after gallery-then-photo locks and revision revalidation. It does not change photo status, original, thumbnail, dimensions, or quota. Permanent failures are logged and leave full-size availability intact. No original/AVIF fallback is substituted for a missing JPEG. Stale uploaded objects are left unreferenced for retention cleanup. Do not trigger thumbnail reprocessing merely to generate publication files.

### Native compatibility and failed-upload recovery

The publication helper uses `thumbnail(export_profile="srgb")`, supported by the production Debian libvips 8.16 as well as newer hosts. `output_profile` is not a supported thumbnail option in 8.16. The Docker native-media gate executes the application helper on real JPEG/PNG inputs, so a generic codec smoke alone cannot hide an incompatible application option.

The unsupported-option incident can leave initial uploads in `FAILED`, with their original bytes temporarily retained in S3. Redeploying fixed workers, calling the publication backfill, or enqueueing the thumbnail task alone does **not** recover those records: both tasks intentionally exclude `FAILED`. Failed initial processing has already deducted the original size from `storage_used`.

Before attempting recovery, quiesce orphan cleanup, including any already queued/running cleanup job. Its hourly sweep deletes `PENDING` and `FAILED` originals and rows once **uploaded_at** is older than 30 minutes; the deadline is not measured from the failure time. A surviving row does not prove its S3 object still exists. If cleanup has removed the source, restore it from an external backup/object version or re-upload; no derivative task can reconstruct it.

Recovery must target explicit photo IDs confirmed by incident logs, not every failed image. After verifying the live gallery, failed image status, absence of pending rotation, and intact source/delivery objects, an operator can atomically transition those rows from `FAILED` to `PROCESSING` and add their `file_size` back to their owners' `storage_used` exactly once. Leave `storage_reserved`, original keys, IDs, timestamps, and rotation revisions unchanged. Use gallery/photo/owner locking and revalidate status before incrementing quota; a repeated attempt must not increment it again. Only after that transaction commits, enqueue `create_thumbnails_batch_task` with the persisted `photo_id` and original `object_key`, in batches of ten. Resume cleanup after the affected records are no longer eligible for deletion. Do not mark records directly successful or use a global quota reconciliation as a recovery shortcut.

There is no automatic failed-upload retry endpoint. Production recovery therefore requires an operator with DB/S3 access and an incident-specific reviewed transaction; the source-code fix does not imply that existing failed records have been repaired.

## Demo limitations

Demo estimates explicitly simulate each image's publication size as `Math.round(file_size * 0.25)`; video bytes are not reduced. Gallery, selection, single, shared gallery, listed project, and project-gallery scopes apply the same successful/media/visibility filters. Private pending rotations block only included files. Invalid IDs/scopes reject rather than silently downloading unrelated files.

Demo archive downloads remain `.txt` manifests, not real ZIPs. They contain selected quality, simulated size, and included filenames (publication image names end `_publication.jpg`). Single downloads use sample URLs and do **not** prove the publication JPEG profile. The dialog labels sizes and archives simulated and explains the sample-photo limitation. No client-side encoder or ZIP library is used.

## Operational verification

Run the approved backend pipeline, rotation, backfill, API, cleanup, and migration tests with native libvips/ExifTool and Docker-backed fixtures. Run affected frontend service/page/hook/dialog tests. Real-file smoke must additionally inspect downloaded JPEG dimensions, orientation, ICC/metadata and alpha compositing, unpack ZIP contents, verify unchanged video bytes, exercise rotation/reset and backfill, and inspect private form/public HEAD+GET options. Demo smoke proves controls and simulated manifests only, never production encoding or archives.
