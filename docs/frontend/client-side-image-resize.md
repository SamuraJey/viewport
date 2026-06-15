# Client-Side Image Resize

Oversized JPEG/PNG files (>10 MB) are resized in the browser before upload using
`browser-image-compression`. Users never hit a hard rejection — oversized files
always open the upload confirmation modal where resize controls are available.

## Entry point

`PhotoUploadConfirmModal` (`frontend/src/components/PhotoUploadConfirmModal.tsx`)
always renders `UploadSelectionContent` when files are selected. The early
rejection path for oversized files was removed.

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

There is **no user-facing quality slider**. The library auto-optimizes — any
hand-tuned quality would be overridden by the binary search anyway.

## Supported MIME types

`SUPPORTED_RESIZE_TYPES` in `imageResize.ts`:
```ts
['image/jpeg', 'image/png', 'image/jpg']
```

Must stay aligned with `supportedUploadTypes` in `uploadConfirmUtils.ts`.
Mismatch causes the Resize button to appear but throw on click.

## UI: upload confirmation modal

All resize UI lives in `frontend/src/components/upload-confirm/`.

### Single resize

Per-file "Resize" button in `FileCard` (only visible when `canResize` is true —
file is oversized AND has a supported type).

Flow: `handleResize(index)` → `resizeImageForUpload(file)` → `handleReplaceFile(index, resized)`.

Errors shown via `resizeError` banner (auto-clears after 5 seconds).

### Batch resize

"Resize All (N)" button in the issues banner (visible when `hasLargeFiles`).

Flow: `handleResizeAll()` → local mutable copy of `files` → sequential `resizeImageForUpload` per oversized file → `onFilesChange(workingFiles)` once at end.

Batch errors accumulated as `failedCount` and surfaced after the loop:
`"2 of 5 files failed to resize"`.

### Size display

Oversized files show: `14.2 MB → ≤ 10 MB`

This is an honest upper bound — the library guarantees output ≤10 MB. No fake
estimate is computed.

## Performance considerations

| Concern | Solution |
|---|---|
| `FileCard` re-renders during batch | `isResizingBatch` prop disables Framer Motion `layout` animation |
| `handleResize`/`handleResizeAll` recreations | Wrapped in `useCallback` with correct deps |
| Stale-closure overwrites in batch loop | Local mutable copy, single `onFilesChange` at end |
| Bundle size (~25 KB gzipped) | Vite code-splits via dynamic import in modal path |

## Utility functions

In `frontend/src/components/upload-confirm/uploadConfirmUtils.ts`:

| Function | Purpose |
|---|---|
| `isFileTooLarge(file)` | `file.size > MAX_UPLOAD_FILE_SIZE_BYTES` |
| `isResizableFile(file)` | Too large AND supported type — gates the Resize button |
| `hasFileUploadError(file)` | Too large OR invalid type |
| `getFileUploadErrorText(file)` | Human-readable error for the file card |

## Related files

```
frontend/src/
├── lib/
│   └── imageResize.ts              # resizeImageForUpload
├── components/
│   ├── PhotoUploader.tsx           # Entry: file selection → modal
│   ├── PhotoUploadConfirmModal.tsx # Modal orchestration
│   └── upload-confirm/
│       ├── UploadSelectionContent.tsx  # Resize UI, handlers, state
│       └── uploadConfirmUtils.ts       # Size/type checks
├── hooks/
│   └── usePhotoUpload.ts           # handleReplaceFile, onFilesChange
└── constants/
    └── upload.ts                   # MAX_UPLOAD_FILE_SIZE_BYTES
```
