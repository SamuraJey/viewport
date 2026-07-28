# Photo upload UX

The owner gallery uses a staged, queue-first upload flow. Dropping supported
files anywhere on the gallery page, choosing **Add photos**, or pasting files
from the clipboard opens the same review queue before the existing presigned
upload pipeline starts. The uploader remains mounted across gallery tabs, so
the queue is available while the owner reviews Appearance or other gallery
settings.

## Interaction model

- `GalleryDropZone` owns page-wide drag-and-drop and clipboard intake.
- `UploadDropzone` is the shared `react-dropzone` boundary. While files are
  dragged over any part of the gallery, including the header, a full-screen
  overlay communicates whether the payload can be accepted.
- Clipboard files are accepted everywhere except editable controls such as
  inputs, textareas, selects, and content-editable regions.
- `PhotoUploader` normalizes all entry points, removes duplicates, and opens
  `UploadConfirmModal` without an artificial file-count cap. Paste feedback
  reports the number actually staged after deduplication; no
  success toast is shown when nothing enters the queue.
- Before transfer starts, more files can be dropped or pasted directly into the
  open review modal. The modal uses direct drag handlers plus the shared
  editable-control-safe paste handler, then applies validation and deduplication
  before appending files without disturbing the existing order.
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
  pinned above the scrollable queue so counts, bytes, failures, and the number of
  parallel file jobs remain visible at any scroll position.

The backend API remains unchanged: images still use presigned PUT plus batch
confirmation through `/batch-confirm`; videos retain multipart part uploads,
server-side completion, and abort. Video parts continue to upload with the
existing bounded concurrency, timeout, and retry behavior. The frontend service
emits a per-file progress map so the queue can render accurate status without
changing the server contract.

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
- keyboard and pointer queue reordering.

Run:

```bash
cd frontend
npm run lint
npm run test:run
VITE_API_URL=https://api.example.test npm run build
```
