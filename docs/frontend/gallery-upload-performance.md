# Gallery and upload rendering performance

The owner gallery and upload review queue have separate rendering paths. Owner
pages keep their existing 100-photo pagination and contain-fit images; they do
not use the public gallery geometry hook or public layout controls.

## Upload review

Queues of up to 80 files keep their ordinary responsive grid. Larger queues use
`WindowedUploadGrid`: only visible rows plus two rows on each side mount their
cards, sortables, and preview effects. Row heights are measured, including
validation/resize/retry messages, rather than truncating content to a fixed
height. The full file list and upload order remain in memory. No file-count cap
is imposed, and the presigned image / multipart video APIs and four-file upload
pool are unchanged.

Dragged and focused rows, plus their immediate neighbors, remain mounted during
manual scrolling. The dnd-kit grip still supports both pointer and keyboard
reorder. Keyboard scroll uses immediate movement so repeated arrow keys cannot
outrun a smooth scroll animation. List items expose their full queue position
and total through `aria-posinset` and `aria-setsize`. Unmounted items become
available as the viewport moves; retained neighboring rows support sequential
Tab navigation.

Responsive column regrouping captures the focused file ID and control identity
before rows are replaced and restores that control after commit, without
scrolling. Reorder, remove, resize and retry controls have stable identifiers;
restoration does not take focus from another element the user has selected.

One shared intersection observer requests previews only near the viewport. A
global two-slot scheduler bounds simultaneous decode/encode work. Supported
browsers run `createImageBitmap` and `OffscreenCanvas` in module workers.
Portraits resize the already decoded bitmap rather than decoding the original
twice, and EXIF orientation is applied. Both sides are bounded to 400px. Canvas
buffers and image bitmaps are released after use. Worker startup/crash/15-second
timeout falls back to the bounded main-thread path; browsers without
`createImageBitmap` use a temporary Image/canvas. Unreadable images retain the
existing native-image fallback.

The cache retains at most 64 compressed derivatives. Its weak file keys do not
keep originals alive, and it stores neither full-file URLs nor decoded rasters.
Each mounted card owns and revokes its object URL. Removing/unmounting a card
aborts waiting preview work; an already active decode retains its slot until it
finishes and discards its result if cancelled.

Progress metadata and validation are prepared independently of network updates.
Idle jobs have no entries in the changing progress table. Unchanged job objects,
sortable IDs, callbacks, and sensor options keep their identities: updating one
file no longer broadcasts to every sortable card. The service shares unchanged
per-file progress objects between immutable full snapshots and optionally
provides `changedFilenames` for consumers. Demo/other callers without this hint
still work through the full-snapshot path.

## Owner gallery

`GalleryPhotoSection` gives cards stable callbacks that forward to the latest
committed page actions, including selection, rotation, and dialogs. Selection
updates redraw affected cards; unrelated page state does not redraw the full
grid. `usePhotoRotation` memoizes its displayed photo array so preview updates
do not recreate all optimistic photo objects.

Cards request asynchronous thumbnail decoding and give the first four images
high fetch priority. Native `content-visibility: auto` skips distant card
layout/paint while keeping cards available for keyboard access, browser find,
and lightbox scroll-to-photo. Intrinsic heights match the existing image and
caption breakpoints; rendered cards remember their actual heights. See
[MDN content visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility).

Intrinsic fallback sizes use rem-based image height and caption padding, with
the caption target and inner border accounted for separately. Readability mode's
fixed 44px button minimum is included, so newly skipped cards reserve the correct
height at 100%, 125% and 150% font scales rather than expanding when revealed.

Cards attach a size observer only while a quarter-turn preview needs fitting.
Measurements use ResizeObserver entries rather than synchronous client-size
reads on every card. Loaded cards remain mounted during revalidation; the
labeled skeleton is used when there are no loaded photos. The gallery route's
existing 220ms initial reveal remains in place.

### Owner page navigation

Photo pagination appears above and below the owner grid when there is more than
one page. Both controls use the same URL-synced pagination state and loading
lock, with distinct navigation labels for assistive technology. The upper
controls sit after the selection bar and before the photos on desktop and mobile.

Owner pagination retains all 100 native photo targets but reuses the grid's
fixed positional slots. Every photo prop and callback changes with the incoming
page. `OwnerPhotoThumbnail` is separately keyed by thumbnail URL, so a broken
image or loading state cannot carry into another photo. Successful image loads
set a native `data-loaded` attribute; CSS reveals the image and hides its
placeholder without scheduling a React render for every thumbnail. Errors still
use React state. Unknown natural dimensions are captured only when needed for a
pending quarter-turn fit.

One shared IntersectionObserver mounts action overlays near the viewport and
releases them as cards leave it. The image and filename targets, cover/status
badges and selection checkbox remain mounted. A focused card keeps its actions
even when scrolled away. Actions follow the image in DOM order, allowing Tab to
reach them when focusing a distant image activates the controls.

`OwnerGalleryPageCache` belongs to one mounted owner route and filter combination
(gallery, page size, search and sort). It retains at most three pages for 30
seconds, deduplicates concurrent requests, and speculatively fetches only the
next page during idle time. It skips speculation when hidden, on Save-Data/2G,
on the last page, or while visible media/rotation is processing. Unfinished media
is never cached. At most eight next-page thumbnails are retained and decoded
with two concurrent `Image.decode()` calls; originals are never prefetched.

Upload, rename, delete, cover/appearance/date/sort writes and rotation responses
invalidate the cache. Writes invalidate both before and after publication where
needed, so an in-flight speculative read cannot restore stale metadata. A
foreground read invalidated during a mutation retries the requested page;
request sequence guards prevent older pages or filter results from replacing
the latest request. Cache cleanup also cancels idle work and releases warmed
images. Explicit refresh/retry bypasses cached results. Nothing is stored in
Web Storage, and changes from another client can remain cached for at most 30
seconds. Page publication uses a React transition while the existing grid
remains available during loading.

Rotation refresh reuses this publication/error path silently: it publishes the
total and shooting date with the photos and releases loading inherited from a
superseded foreground request on success or failure. An obsolete failure cannot
clear a newer request's loading state or report an error for that request.

The implementation follows the native
[image decode lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)
and [React transition behavior](https://react.dev/reference/react/startTransition).

## Reproduce measurements

Use a disposable browser profile; the script replaces the open tab's contents
and mocks the upload service. It does not upload files or contact storage.

```bash
cd frontend
npm run dev -- --host 127.0.0.1
chromium --headless --no-sandbox --disable-dev-shm-usage \
  --remote-debugging-port=9229 --user-data-dir=/tmp/viewport-perf-browser about:blank
PERF_VERIFY=1 node performance/gallery-upload.mjs
PERF_COUNT=10000 PERF_CPU_RATE=4 node performance/gallery-upload.mjs
```

`PERF_URL` and `CDP_URL` override the local server/debugger addresses. Default
queue size is 1000. The browser contract checks use that fixed fixture size.
The benchmark creates 6000×4000 JPEG files, exercises the real upload hook/grid,
and simulates 25 progress updates 50ms apart. The gallery fixture contains 100
cards and exercises 25 selections. React Profiler commit durations, browser
long tasks and requestAnimationFrame intervals are reported separately; fixture
allocation/import time is excluded from the mount measurement.

Representative local headless Chromium/Vite development measurements:

| Scenario | Before: React total / max commit | After: React total / max commit | Before / after frame p95 |
| --- | --- | --- | --- |
| Open 1000-file queue | 367 / 339 ms | 40 / 17 ms | 17 / 17 ms |
| 25 progress updates, 1000 files | 3209 / 158 ms | 37 / 6 ms | 217 / 17 ms |
| 25 selections, 100 owner photos | 419 / 33 ms | 45 / 2 ms | 67 / 17 ms |

The queue mounts roughly 24 cards instead of 1000 in the desktop fixture. After
optimization, progress/selection updates produced no browser long tasks in
this run. With 10000 files and 4× CPU slowdown, the progress test also reached
17ms frame p95 with no long tasks. Initial metadata preparation is still linear
in the file count: that stress run's initial maximum commit was about 151ms.
These are synthetic development measurements, not guarantees for every device
or network; real S3 bandwidth, server processing, and image complexity remain
independent costs.

Browser checks additionally cover reaching the last of 1000 files inside the
actual review modal, pointer reorder from first to last, keyboard reorder past
the initial virtual window with focus retained, desktop/mobile column changes,
400px preview bounds, a 267×400 EXIF-rotated portrait, cache reuse on return, and
object URL cleanup. Unit tests cover concurrency/cancellation, worker failure
recovery and native fallback, sparse progress identities, a 10000-file virtual
queue, focus retention, latest gallery actions, and skeleton revalidation.
The browser verifier also opens the full owner `GalleryPage` route in demo mode
with a 100-photo fixture, performs 25 actual selection clicks and checks that
all selections persist. This full-route run reached 17ms frame p95 with no long
tasks, including the page's real header, hooks, sidebar and selection toolbar.

### Pagination measurements

The pagination benchmark opens the actual owner route with 300 photos, three
100-photo pages, distinct 640×427 JPEG thumbnails and an artificial 180ms API
delay. It reports time to the incoming page's first DOM image, long tasks and
frame intervals during replacement and a subsequent 400ms settling period.
This is a synthetic development benchmark, not a server or paint-time measurement.

```bash
chromium --headless --no-sandbox --disable-dev-shm-usage \
  --remote-debugging-port=9235 --user-data-dir=/tmp/viewport-pagination-browser about:blank
PERF_URL=http://127.0.0.1:5173 CDP_URL=http://127.0.0.1:9235 \
  PERF_VERIFY=1 PERF_CPU_RATE=1 node performance/gallery-pagination.mjs
PERF_URL=http://127.0.0.1:5173 CDP_URL=http://127.0.0.1:9235 \
  PERF_VERIFY=1 PERF_CPU_RATE=4 node performance/gallery-pagination.mjs
```

| Three-page navigation at 4× CPU slowdown | Before | After |
| --- | --- | --- |
| Incoming page DOM available | 639–683 ms | 302–341 ms |
| Longest task per transition | 294–337 ms | 0–55 ms |
| Frame interval p95 | 67–83 ms | 33–50 ms |
| API reads over five page clicks | 6 including initial load | 3 including initial load and speculation |
| Card action targets near the initial viewport | 700 | 250 |

Without CPU slowdown, isolated runs reached 17ms frame p95, no long tasks and
roughly 53–75ms to the incoming DOM. A separate run after scrolling through the
whole grid retained only 225 action targets and reached 17ms frame p95 without
long tasks. Its 4× CPU counterpart had a 68ms task and 33ms frame p95. Thus slow
devices still have occasional frame-budget overruns; cache misses still incur
network latency, and only eight next-page thumbnails are warmed. The changes
reduce work rather than promise 60 FPS on all hardware.

`PERF_VERIFY=1` additionally checks request reuse, bounded controls after a full
scroll, all 100 lightbox/native targets, Tab access to deferred actions, lightbox
opening/closing, mobile geometry, decoded visible thumbnails and hidden loading
placeholders in dark theme. Unit tests cover cache expiry/eviction, deduplication,
invalidation while reads are in flight, unfinished media, constrained connections,
decode bounds/cleanup, stale page responses, mutation refresh and focus retention.

```bash
npm run lint:fix
npm run lint:css
npm run test:run
VITE_API_URL=https://api.example.test npm run build
```
