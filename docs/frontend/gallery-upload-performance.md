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

Cards attach a size observer only while a quarter-turn preview needs fitting.
Measurements use ResizeObserver entries rather than synchronous client-size
reads on every card. Loaded cards remain mounted during revalidation; the
labeled skeleton is used when there are no loaded photos. The gallery route's
existing 220ms initial reveal remains in place.

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

```bash
npm run lint:fix
npm run lint:css
npm run test:run
VITE_API_URL=https://api.example.test npm run build
```
