# Client-Side Image Resize

Oversized JPEG/PNG files (>10 MB) that enter the upload queue can be resized in
the browser using `browser-image-compression`. They remain staged in the
confirmation modal, but cannot upload until resized to the 10 MB image limit or
removed.

## Entry point

`UploadConfirmModal` (`frontend/src/components/upload/UploadConfirmModal.tsx`)
keeps oversized supported images in the staged upload queue with resize controls
instead of rejecting them before review.

## Core module

`frontend/src/lib/imageResize.ts` — `resizeImageForUpload(file, maxBytes?, quality?)`

- Returns the original `File` if already under limit (no unnecessary processing).
- Uses Web Worker (`useWebWorker: true`) for off-main-thread compression.
- Preserves file identity: name and type carried through `new File([compressed], name, { type })`.
- `quality` parameter (0.1–1.0) is optional; passed as `initialQuality` to the library.

## How compression works

`browser-image-compression` uses **binary search** to find the best quality that
fits within `maxSizeMB` (always 10 MB — the upload limit):

1. Start at `initialQuality` (default 1.0 if not passed).
2. Compress, check size.
3. If output > maxSizeMB → lower quality, try again.
4. If output ≤ maxSizeMB → raise quality if possible, try again.
5. Converge to the **maximum quality** that stays within the limit.

Resolution is capped at **4096 px** on the long edge (`maxWidthOrHeight: 4096`) —
important for photographers with high-megapixel source images.

There is **no user-facing quality slider**. The library auto-optimizes — any
hand-tuned quality would be overridden by the binary search anyway.

## Supported MIME types

`SUPPORTED_IMAGE_TYPES` in `constants/upload.ts` is the single source of truth:

```ts
['image/jpeg', 'image/png', 'image/jpg']
```

When a browser omits `File.type`, upload classification resolves a supported
content type from the filename extension before validation or resizing.

## UI: upload confirmation modal

All current resize orchestration lives in
`frontend/src/components/upload/UploadConfirmModal.tsx`, with row actions in
`UploadQueueItem.tsx`.

### Single resize

The per-file **Resize** button is visible only when the shared
`isResizableOversizedImage` predicate passes: the file is a supported image and
exceeds the 10 MB image limit.

Flow: `handleResize(jobId)` → `resizeImageForUpload(file)` →
`handleReplaceJob(jobId, resized)`.

Resize errors are shown as a toast and leave the original queue row available.

### Batch resize

**Resize all** is available when one or more queue rows satisfy the same shared
resize predicate.

Flow: `handleResizeAll()` → local mutable copy of `files` → sequential
`resizeImageForUpload` per eligible image → `onFilesChange(workingFiles)` once
at the end.

Each failed resize reports its file and leaves that original file in the queue.

### Size display

Oversized files show: `14.2 MB → ≤ 10 MB`

This is an honest upper bound — the library guarantees output ≤10 MB. No fake
estimate is computed.

### Queue and cancellation contract

Files from **Add photos**, page-wide drag-and-drop, and clipboard paste enter the
same confirmation queue. Owners may reorder it before upload with the pointer or
keyboard grip. Each row keeps independent progress and failure state, and retry
requests a fresh upload intent for that file only. Closing a populated or active
queue requires confirmation; canceling an active run stops remaining work
without undoing files that already completed. Images must be at most 10 MB after
optional resize, while supported videos remain unmodified and may be up to
500 MB. See [Photo upload UX](../photo-upload-ux.md) for the complete intake and
transfer contract.

## Performance considerations

| Concern | Solution |
|---|---|
| Queue rows during batch resize | Per-row `resizingJobId` keeps the active state local |
| `handleResize`/`handleResizeAll` recreations | Wrapped in `useCallback` with explicit dependencies |
| Stale-closure overwrites in batch loop | Local mutable copy, single `onFilesChange` at the end |
| Bundle size (~25 KB gzipped) | Code-split via page-level `React.lazy()` on `GalleryPage` in `App.tsx` |

## Utility functions

In `frontend/src/components/upload/uploadUtils.ts`:

| Function | Purpose |
|---|---|
| `isResizableOversizedImage(file)` | Supported oversized image — gates all resize actions |
| `getUploadValidationError(file)` | Empty, unsupported, and type-specific size validation |
| `prepareUploadSelection(current, incoming)` | Deduplication and the 200-file queue limit |

## Related files

```text
frontend/src/
├── lib/
│   ├── imageResize.ts              # resizeImageForUpload
│   └── imageThumbnail.ts            # createImageThumbnail (thumbnail previews)
├── components/
│   ├── PhotoUploader.tsx           # Entry: file selection → modal
│   └── upload/
│       ├── UploadConfirmModal.tsx  # Queue and resize orchestration
│       ├── UploadQueueItem.tsx     # Per-file resize action
│       └── uploadUtils.ts          # Shared validation and resize predicate
├── hooks/
│   └── usePhotoUpload.ts           # Queue jobs, replace, upload, retry, cancel
└── constants/
    └── upload.ts                   # Image/video types and size limits
```
