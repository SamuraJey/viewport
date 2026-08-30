# Photo upload UX

The owner gallery uses a staged, queue-first upload flow. Dropping supported
files anywhere on the gallery page, choosing **Add photos**, or pasting files
from the clipboard opens the same review queue before the existing presigned
upload pipeline starts. The uploader remains mounted across gallery tabs, so
the queue is available while the owner reviews Appearance or other gallery
settings.

## Folder and directory upload

In addition to individual files, the owner can upload a directory. Only the
directory's **top-level** supported images and videos are collected into a flat
queue in the current gallery; nested subdirectories are **not** walked. This
keeps intake fast for large trees. Directory structure is **not preserved**,
and the relative path is used only on the client for file identity and
deduplication; it is never sent to the backend or persisted.

### Entry points

- **Folder picker**: the gallery header **Add photos** control is a split
  action. The main button opens the regular file picker (one click, unchanged
  from before). The adjacent chevron opens a popover with **Upload files** and
  **Upload folder** options. The folder option uses a hidden
   `<input type="file" webkitdirectory>` and is feature-detected — on browsers
   that do not support `webkitdirectory`, the folder action is
   hidden so users never see a misleading control. The browser collects the
   whole tree natively, but `filterTopLevelFiles` keeps only top-level files
   (a file whose `webkitRelativePath` has at most one `/`) before intake.
- **Directory drag-and-drop**: dropping a directory onto any part of the
  gallery page, or onto the open review modal, reads the directory's
  top-level files into the queue. Nested subdirectories are skipped. Mixed
  drops (files and folders together) are supported.

### Top-level extraction

The shared `extractFilesFromEvent` function in `uploadUtils.ts` handles all
three event shapes:

1. `<input>` change events — reads `event.target.files`. For directory inputs,
   `File.webkitRelativePath` is already populated by the browser.
2. Plain drops without the Entry API — falls back to `dataTransfer.files`.
3. Directory drops using the Entry API — iterates `dataTransfer.items`,
   resolves each via `getAsEntry()` / `webkitGetAsEntry()`, and reads the
   directory's immediate file entries (no recursion into subdirectories).

Directory read details:

- `createReader().readEntries()` is called repeatedly until it returns an
  empty array. Chromium caps each call at approximately 100 entries, so a
  single call is never treated as the complete result.
- The read yields to the event loop between batches so the UI stays
  responsive for large directories.
- No artificial file-count cap is imposed. The queue relies on lazy thumbnail
  loading for large selections.
- Empty directories produce no queue entries.
- Unreadable file entries are skipped rather than failing the entire read.
- `entry.fullPath` is stored as the client-side source path via a `WeakMap`
  (the browser `File` object is never mutated).

### Deduplication identity

The deduplication key (`getUploadFileKey`) now includes the normalized source
path:

```text
sourcePath::name::size::type::lastModified
```

This ensures:

- Two files with the same basename from different subdirectories
  (`sub-a/photo.jpg` and `sub-b/photo.jpg`) are treated as **distinct** and
  both remain in the queue.
- Re-adding the same file from the same source path is **deduplicated**.
- Files without a source path (regular file picker, paste) keep the previous
  behavior.

### Auto-rename

Duplicate basenames in the flattened queue receive the existing suffix scheme:
`photo.jpg`, `photo (1).jpg`, `photo (2).jpg`, etc. This is the same logic
used for regular multi-file uploads — the backend receives only the final
filename, and the object key remains `gallery_id/photo_id.ext`.

### Scanning state

Because directory traversal is asynchronous, a visible scanning state is
shown:

- On the page-wide overlay: **"Scanning folder"** with a spinner while
  `react-dropzone`'s `isProcessing` is true (the `getFilesFromEvent` promise
  is resolving).
- In the review modal: a local `isScanningDrop` state shows the same scanning
  overlay and blocks a second drop/paste until extraction completes.
- A polite live region announces the scanning state for screen readers.

During scanning, a second intake is blocked to prevent a parallel queue.

### Resize and source path

When an oversized image is resized before upload, the source path is
transferred from the original `File` to the resized `File` via
`transferUploadSourcePath`, keeping deduplication identity stable across the
transformation.

### Backend contract

The backend and S3 contract is **unchanged**:

- Only the final filename is sent in the presign request.
- Object keys remain `gallery_id/photo_id.ext`.
- Quota, batch confirmation, multipart video upload, retry, and cancel
  behavior are all unchanged.
- The relative path never reaches the backend.

## Interaction model

- `GalleryDropZone` owns page-wide drag-and-drop and clipboard intake.
- `UploadDropzone` is the shared `react-dropzone` boundary. While files are
  dragged over any part of the gallery, including the header, a full-screen
  overlay communicates whether the payload can be accepted. The overlay
  classifies the payload as files, folders, or mixed so a directory is never
  labelled as a file.
- Clipboard files are accepted everywhere except editable controls such as
  inputs, textareas, selects, and content-editable regions.
- `PhotoUploader` normalizes all entry points, removes duplicates, and opens
  `UploadConfirmModal` without an artificial file-count cap. Paste feedback
  reports the number actually staged after deduplication; no
  success toast is shown when nothing enters the queue.
- Before transfer starts, more files can be dropped or pasted directly into the
  open review modal. The modal uses direct drag handlers plus the shared
  editable-control-safe paste handler, then applies validation and deduplication
  before appending files without disturbing the existing order. Directory drops
  onto the modal use the same async extractor and show a scanning overlay.
- The uploader runs up to four file jobs concurrently. This restores the
  established multi-transfer throughput while keeping browser and storage
  request pressure bounded; multipart videos retain their separate four-part
  concurrency limit.
- The queue can be reordered before upload with pointer drag or from the
  dedicated grip with Space and the arrow keys. That visible order determines
  submission order and is locked after transfer starts; concurrent transfers
  may still finish in a different order.
- Each queue card shows its own validation, upload progress, completion, or
  failure state. The queue uses a compact proofing grid with up to four cards
  per row on desktop, keeping previews large enough to recognize each frame
  without reducing scanability for large selections. Thumbnail generation
  preserves the source aspect ratio; the 4:3 card applies a cover crop instead
  of stretching the photograph. A failed card retries only that file using a
  fresh upload intent.
- Queue thumbnails are generated only when rows approach the viewport, avoiding
  a burst of bitmap work for large selections.
- While a transfer is active, the compact aggregate status and progress bar stay
  pinned above the scrollable queue so counts, bytes, failures, and the number
  of parallel file jobs remain visible at any scroll position.

The backend API remains unchanged: images still use presigned PUT plus batch
confirmation through `/batch-confirm`; videos retain multipart part uploads,
server-side completion, and abort. Video parts continue to upload with the
existing bounded concurrency, timeout, and retry behavior. The frontend service
emits a per-file progress map so the queue can render accurate status without
changing the server contract.

## Folder and directory intake

Folder intake is a **frontend-only** path. The directory structure is never
stored: the folder's top-level supported images and videos are collected and
flattened into the current gallery's queue (nested subdirectories are not
walked), so the backend, object keys (`gallery_id/photo_id.ext`), quota,
presign, and multipart contracts are untouched.

- **Entry points.** The gallery header **Add photos** control is a split action:
  the main button opens the regular file picker in one click (unchanged), and an
  adjacent chevron opens an `AppPopover` with **Upload files** and **Upload
  folder**. The folder action is feature-detected via `webkitdirectory` and is
  hidden in browsers that do not support it, so the single-click file path is
  always available and no misleading folder action is shown. A directory can
  also be dropped anywhere on the gallery page or onto the open review modal.
  The Project page's empty state ("Build this project with galleries") also
  offers an **Upload folder** action: it creates a new gallery named after the
  chosen folder (truncated to the gallery-name limit) and opens it with the
  folder's top-level supported files already staged in the review queue.
- **Project-page folder handoff.** Because the new gallery does not exist until
  it is created, the Project page enqueues the selected files in an in-memory
  `pendingFilesQueue` keyed by the new gallery id, then navigates to the gallery
  route. The Gallery page consumes the queue once its uploader is ready and feeds
  the files through the existing `handleExternalFiles` review flow. Files are held
  in memory only (never serialized or sent anywhere), the queue is cleared on
  first read (idempotent under StrictMode), and no backend change is required.
- **Top-level collection.** Dropped directories are read with the File System
  Entry API (`webkitGetAsEntry`/`getAsEntry`, `createReader().readEntries()`
  called until it returns an empty batch) but only the directory's immediate
  file entries are read — nested subdirectories are skipped to keep intake fast
  for large trees. The read runs **only on the actual drop**, never on
  `dragenter`; during a drag the payload is classified cheaply so the overlay can
  describe it without reading the directory. There is no artificial file-count
  cap.
- **Folder picker filtering.** The `webkitdirectory` picker collects the whole
  tree natively in the browser, so `filterTopLevelFiles` drops files whose
  `webkitRelativePath` contains a subdirectory, keeping only top-level files and
  making the picker consistent with directory drops.
- **Flattening.** Top-level files are flattened into a single flat queue for the
  gallery. Empty directories produce no queue entries, and unsupported files
  (e.g. `readme.txt`) are filtered by the existing type/size validation.
- **Client-only relative path.** The relative path is used *only* on the client
  to identify files. Directory-picker files expose `File.webkitRelativePath`;
  directory-drop files are tagged with `entry.fullPath` through a `WeakMap`
  (the browser `File` is never mutated). The upload identity key
  (`name + size + type + lastModified + sourcePath`) includes the normalized
  source path when known, so two `photo.jpg` files from different top-level
  drops are kept distinct, while re-selecting the same file from the same folder
  still deduplicates. The path is **never sent to the backend** and
  is not persisted.
- **Same basenames.** Files that collide on filename receive the existing
  deterministic rename (`photo.jpg`, `photo (1).jpg`, …) and rename warnings,
  exactly as with a flat multi-file selection.
- **Scanning state.** Because a large directory is read asynchronously, the
  overlay and review modal show a **Scanning folder** state (with a polite live
  region) while the directory is being read, and a second drop is blocked until
  the first read finishes. A directory that cannot be read surfaces a single
  clear error instead of opening the queue with a misleadingly empty result.
- **Browser fallback.** When the Entry API is unavailable, dropped items fall
  back to `getAsFile()`. When `webkitdirectory` is unsupported, the folder
  action is hidden and ordinary multi-file selection remains available.

## Validation and failure handling

- Supported images: JPG/JPEG and PNG. The upload limit is 10 MB; when a
  browser omits `File.type`, the supported image MIME type and size limit are
  resolved from the filename extension before the presign request. Oversized
  images that enter the queue must be resized or removed before upload.
- Accepted videos: MP4, MOV, M4V, WEBM, MKV, AVI, MPEG/MPG, and 3GP, up to
  500 MB. When a browser omits `File.type`, the supported MIME type and size
  limit are resolved from the filename extension before the presign request.
- Empty, unsupported, duplicate, and oversized files receive immediate feedback.
- Removing the final queued file closes the empty review dialog and immediately
  restores page-wide drag-and-drop and paste intake.
- New page-wide drop and paste intake is disabled while another gallery modal,
  upload, or image resize is active, which keeps the running queue stable.
- Oversized supported images can be resized individually or as a batch before
  upload. Resizing targets the 10 MB image limit, caps the long edge at 4096 px,
  and never applies to videos.
- Closing a populated or active queue shows a warning. Confirming cancellation
  aborts the active run, clears its current progress/result, and prevents late
  callbacks from restoring canceled state or leaving rows marked as uploading.
  Files already transferred before cancellation are finalized through a fresh
  control request that does not reuse the aborted transfer signal, and the
  partial result refreshes the gallery after the dialog closes. Demo mode
  recalculates and persists completed-file storage usage before propagating
  cancellation.
- A failed row always requests a fresh image or multipart upload intent; stale
  photo IDs, upload IDs, and presigned URLs are never reused.

Auto-confirm and transfer-speed analytics from RFC 008 remain optional and are
not part of this implementation. The current product has no tag or destination
step, so auto-confirm would add a setting without removing an actual
confirmation decision.

## Accessibility and theming

The upload UI uses semantic theme tokens and supports both light and dark
gallery themes. The dialog uses the shared `AppDialog` focus management. Queue
grips expose sortable keyboard instructions, DnD announcements describe moves,
and progress bars expose numeric values. Visual byte-level progress is
throttled, with terminal success/failure updates forced through immediately; a
polite live region announces coarse queue and transfer counts rather than every
percentage tick.

## Verification

Frontend coverage includes:

- queue deduplication and validation without selection truncation;
- clipboard intake and editable-control exclusions;
- page-wide drop acceptance and rejection feedback;
- per-file upload progress and retry behavior;
- keyboard and pointer queue reordering;
- directory extraction: file entries, top-level-only reads (nested
  subdirectories skipped), mixed drops, repeated `readEntries()` batches,
  `getAsFile` fallback;
- `filterTopLevelFiles`: keeps top-level files, drops nested subdirectory files,
  keeps files without a relative path;
- source path deduplication: same basename from different paths stays
  distinct, same source path deduplicates;
- source path transfer through image resize;
- folder picker: `webkitdirectory` attribute, review queue opening,
  duplicate detection on re-selection;
- gallery header split action: one-click file upload, folder menu, hidden
  folder action when unsupported;
- review modal directory drop: scanning state, intake blocking.

Run:

```bash
cd frontend
npm run lint
npm run test:run
VITE_API_URL=https://api.example.test npm run build
```

After automated tests, a browser smoke test with a real fixture directory is
recommended:

```text
fixture/
  photo.jpg
  clip.mp4
  sub/nested-photo.jpg
  ignored/readme.txt
```

Verify the folder picker and both drop entry points, the scanning state, the
top-level `photo.jpg` and `clip.mp4` rows, and that the nested
`sub/nested-photo.jpg` and `ignored/readme.txt` are **not** in the queue.
Backend suite is not required since the server contract is unchanged.
