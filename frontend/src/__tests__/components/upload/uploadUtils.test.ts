import { describe, expect, it } from 'vitest';
import {
  classifyDropPayload,
  deduplicateUploadFiles,
  extractFilesFromEvent,
  filterTopLevelFiles,
  getUploadFileKey,
  getUploadSourcePath,
  getUploadValidationError,
  prepareUploadSelection,
  setUploadSourcePath,
  transferUploadSourcePath,
} from '../../../components/upload/uploadUtils';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
} from '../../../constants/upload';

const file = (name: string, size = 4, lastModified = 1) =>
  new File(['x'.repeat(size)], name, {
    type: 'image/jpeg',
    lastModified,
  });

/* ------------------------------------------------------------------ */
/* FileSystemEntry mock helpers                                        */
/* ------------------------------------------------------------------ */

const makeFileEntry = (fullPath: string, fileObj: File): FileSystemFileEntry =>
  ({
    isFile: true,
    isDirectory: false,
    fullPath,
    name: fileObj.name,
    file: (success: (file: File) => void) => success(fileObj),
  }) as unknown as FileSystemFileEntry;

const makeDirEntry = (
  fullPath: string,
  entries: FileSystemEntry[],
  batches?: number,
): FileSystemDirectoryEntry => {
  const chunkSize = batches ? Math.ceil(entries.length / batches) : entries.length;
  let callCount = 0;
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    name: fullPath.split('/').pop() ?? fullPath,
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        const start = callCount * chunkSize;
        callCount += 1;
        const batch = entries.slice(start, start + chunkSize);
        success(batch);
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
};

const makeFileItem = (
  entry: FileSystemEntry | null,
  fileObj: File,
): DataTransferItem =>
  ({
    kind: 'file',
    type: fileObj.type,
    getAsFile: () => fileObj,
    webkitGetAsEntry: () => entry,
    getAsEntry: () => entry,
  }) as unknown as DataTransferItem;

const makeDropEvent = (items: DataTransferItem[]): Event => {
  const dataTransfer = { items } as unknown as DataTransfer;
  return { dataTransfer } as unknown as Event;
};

describe('uploadUtils', () => {
  it('deduplicates the same file identity while preserving order', () => {
    const first = file('one.jpg');
    const duplicate = file('one.jpg');
    const distinct = file('one.jpg', 5);

    expect(deduplicateUploadFiles([first, duplicate, distinct])).toEqual([first, distinct]);
  });

  it('deduplicates against the existing queue without truncating the selection', () => {
    const existing = file('existing.jpg');
    const incoming = Array.from({ length: 202 }, (_, index) =>
      file(`photo-${index}.jpg`),
    );

    const result = prepareUploadSelection([existing], [existing, ...incoming]);

    expect(result.files).toHaveLength(203);
    expect(result.files[0]).toBe(existing);
    expect(result.duplicateCount).toBe(1);
  });

  it('uses extension-aware image and video size messages when MIME is absent', () => {
    const image = new File(['image'], 'oversized.jpg', { type: '' });
    const video = new File(['video'], 'oversized.mov', { type: '' });
    Object.defineProperty(image, 'size', { value: MAX_UPLOAD_FILE_SIZE_BYTES + 1 });
    Object.defineProperty(video, 'size', { value: MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES + 1 });

    expect(getUploadValidationError(image)).toBe(
      'Image exceeds the 10 MB limit. Resize it before uploading.',
    );
    expect(getUploadValidationError(video)).toBe('Video exceeds the 500 MB limit.');
  });
});

/* ------------------------------------------------------------------ */
/* Source path tracking                                                */
/* ------------------------------------------------------------------ */

describe('source path tracking', () => {
  it('stores and reads a source path via the WeakMap', () => {
    const f = file('photo.jpg');
    expect(getUploadSourcePath(f)).toBe('');
    setUploadSourcePath(f, 'subdir/photo.jpg');
    expect(getUploadSourcePath(f)).toBe('subdir/photo.jpg');
  });

  it('normalizes leading slashes and backslashes', () => {
    const f = file('photo.jpg');
    setUploadSourcePath(f, '/root/sub/photo.jpg');
    expect(getUploadSourcePath(f)).toBe('root/sub/photo.jpg');

    const g = file('photo.jpg');
    setUploadSourcePath(g, 'dir\\nested\\photo.jpg');
    expect(getUploadSourcePath(g)).toBe('dir/nested/photo.jpg');
  });

  it('falls back to webkitRelativePath when the WeakMap has no entry', () => {
    const f = file('photo.jpg');
    Object.defineProperty(f, 'webkitRelativePath', {
      value: 'folder/photo.jpg',
      configurable: true,
    });
    expect(getUploadSourcePath(f)).toBe('folder/photo.jpg');
  });

  it('transfers source path from one file to another after resize', () => {
    const original = file('photo.jpg');
    setUploadSourcePath(original, 'sub/photo.jpg');
    const resized = file('photo.jpg');
    expect(getUploadSourcePath(resized)).toBe('');
    transferUploadSourcePath(original, resized);
    expect(getUploadSourcePath(resized)).toBe('sub/photo.jpg');
  });
});

/* ------------------------------------------------------------------ */
/* Deduplication with source paths                                     */
/* ------------------------------------------------------------------ */

describe('deduplication with source paths', () => {
  it('keeps same basename from different source paths as distinct', () => {
    const a = file('photo.jpg');
    setUploadSourcePath(a, 'sub-a/photo.jpg');
    const b = file('photo.jpg');
    setUploadSourcePath(b, 'sub-b/photo.jpg');

    expect(deduplicateUploadFiles([a, b])).toEqual([a, b]);
    expect(getUploadFileKey(a)).not.toBe(getUploadFileKey(b));
  });

  it('deduplicates the same file from the same source path', () => {
    const a = file('photo.jpg');
    setUploadSourcePath(a, 'sub/photo.jpg');
    const b = file('photo.jpg');
    setUploadSourcePath(b, 'sub/photo.jpg');

    expect(deduplicateUploadFiles([a, b])).toEqual([a]);
  });

  it('preserves existing behavior for files without source paths', () => {
    const a = file('photo.jpg');
    const b = file('photo.jpg');
    expect(deduplicateUploadFiles([a, b])).toEqual([a]);
  });
});

/* ------------------------------------------------------------------ */
/* extractFilesFromEvent                                              */
/* ------------------------------------------------------------------ */

describe('extractFilesFromEvent', () => {
  it('extracts a file entry and attaches its source path', async () => {
    const f = file('photo.jpg');
    const entry = makeFileEntry('dir/photo.jpg', f);
    const event = makeDropEvent([makeFileItem(entry, f)]);

    const { files } = await extractFilesFromEvent(event);

    expect(files).toHaveLength(1);
    expect(files[0]).toBe(f);
    expect(getUploadSourcePath(files[0])).toBe('dir/photo.jpg');
  });

  it('reads only top-level files from a directory entry (no recursion)', async () => {
    const deepFile = file('deep.jpg');
    const shallowFile = file('shallow.jpg');
    const nestedDir = makeDirEntry('root/sub', [makeFileEntry('root/sub/deep.jpg', deepFile)]);
    const rootDir = makeDirEntry('root', [
      makeFileEntry('root/shallow.jpg', shallowFile),
      nestedDir,
    ]);

    const event = makeDropEvent([makeFileItem(rootDir, shallowFile)]);

    const { files, hadDirectory } = await extractFilesFromEvent(event);

    // Only the top-level file is read; the nested subdirectory is skipped.
    expect(files).toHaveLength(1);
    expect(files.map((f) => f.name)).toEqual(['shallow.jpg']);
    expect(hadDirectory).toBe(true);
    expect(getUploadSourcePath(shallowFile)).toBe('root/shallow.jpg');
    // The nested file is never read, so it carries no source path.
    expect(getUploadSourcePath(deepFile)).toBe('');
  });

  it('handles a mixed file and directory drop', async () => {
    const looseFile = file('loose.jpg');
    const dirFile = file('inside.jpg');
    const dir = makeDirEntry('folder', [makeFileEntry('folder/inside.jpg', dirFile)]);

    const event = makeDropEvent([
      makeFileItem(makeFileEntry('loose.jpg', looseFile), looseFile),
      makeFileItem(dir, dirFile),
    ]);

    const { files, hadDirectory } = await extractFilesFromEvent(event);

    expect(files).toHaveLength(2);
    expect(hadDirectory).toBe(true);
    expect(files.map((f) => f.name).sort()).toEqual(['inside.jpg', 'loose.jpg']);
  });

  it('handles more than 100 entries with repeated readEntries calls', async () => {
    const entries = Array.from({ length: 150 }, (_, i) =>
      makeFileEntry(`root/file-${i}.jpg`, file(`file-${i}.jpg`)),
    );
    // Split into 2 batches of 75 to simulate Chromium's cap.
    const dir = makeDirEntry('root', entries, 2);

    const event = makeDropEvent([makeFileItem(dir, file('file-0.jpg'))]);

    const { files } = await extractFilesFromEvent(event);

    expect(files).toHaveLength(150);
  });

  it('falls back to getAsFile when the Entry API is unavailable', async () => {
    const f = file('fallback.jpg');
    const item: DataTransferItem = {
      kind: 'file',
      type: f.type,
      getAsFile: () => f,
      // No getAsEntry / webkitGetAsEntry
    } as unknown as DataTransferItem;

    const event = makeDropEvent([item]);

    const { files, hadDirectory } = await extractFilesFromEvent(event);

    expect(files).toHaveLength(1);
    expect(files[0]).toBe(f);
    expect(hadDirectory).toBe(false);
  });

  it('reads files from an input change event', async () => {
    const f1 = file('a.jpg');
    const f2 = file('b.jpg');
    const input = { files: [f1, f2] } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;

    const { files } = await extractFilesFromEvent(event);

    expect(files).toEqual([f1, f2]);
  });

  it('returns empty for an empty directory', async () => {
    const dir = makeDirEntry('empty', []);
    const event = makeDropEvent([makeFileItem(dir, file('dummy.jpg'))]);

    const { files, hadDirectory } = await extractFilesFromEvent(event);

    expect(files).toHaveLength(0);
    expect(hadDirectory).toBe(true);
  });

  it('invokes file() and readEntries() with the entry as `this` (WebIDL semantics)', async () => {
    // Real browser FileSystemEntry methods are WebIDL methods: calling them
    // detached (without the entry/reader as `this`) throws "Illegal invocation".
    // This regression test guards against extracting the method into a bare
    // variable and calling it without the receiver.
    const f = file('photo.jpg');
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      fullPath: 'dir/photo.jpg',
      name: f.name,
      file(this: unknown, success: (file: File) => void) {
        if (this !== fileEntry) {
          throw new TypeError("Failed to execute 'file' on 'FileSystemFileEntry': Illegal invocation");
        }
        success(f);
      },
    } as unknown as FileSystemFileEntry;

    const dirEntry = {
      isFile: false,
      isDirectory: true,
      fullPath: 'dir',
      name: 'dir',
      createReader(this: unknown) {
        if (this !== dirEntry) {
          throw new TypeError(
            "Failed to execute 'createReader' on 'FileSystemDirectoryEntry': Illegal invocation",
          );
        }
        let readCalls = 0;
        const reader = {
          readEntries(this: unknown, success: (entries: FileSystemEntry[]) => void) {
            if (this !== reader) {
              throw new TypeError(
                "Failed to execute 'readEntries' on 'FileSystemDirectoryReader': Illegal invocation",
              );
            }
            // First call returns the file, the next returns an empty batch to
            // signal the end of the directory (Chromium batches reads).
            success(readCalls === 0 ? [fileEntry] : []);
            readCalls += 1;
          },
        };
        return reader;
      },
    } as unknown as FileSystemDirectoryEntry;

    const event = makeDropEvent([makeFileItem(dirEntry, f)]);

    const { files, hadDirectory } = await extractFilesFromEvent(event);

    expect(hadDirectory).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(f);
  });
});

/* ------------------------------------------------------------------ */
/* filterTopLevelFiles                                                 */
/* ------------------------------------------------------------------ */

const fileWithRelativePath = (relativePath: string): File => {
  const f = file(relativePath.split('/').pop() ?? 'file.jpg');
  Object.defineProperty(f, 'webkitRelativePath', {
    value: relativePath,
    configurable: true,
  });
  return f;
};

describe('filterTopLevelFiles', () => {
  it('keeps top-level files and drops nested subdirectory files', () => {
    const top = fileWithRelativePath('folder/a.jpg');
    const nested = fileWithRelativePath('folder/sub/b.jpg');
    const deep = fileWithRelativePath('folder/sub/deeper/c.jpg');

    expect(filterTopLevelFiles([top, nested, deep])).toEqual([top]);
  });

  it('keeps files without a relative path (plain picker / paste)', () => {
    const plain = file('plain.jpg');
    const top = fileWithRelativePath('folder/a.jpg');

    expect(filterTopLevelFiles([plain, top])).toEqual([plain, top]);
  });
});

/* ------------------------------------------------------------------ */
/* classifyDropPayload                                                */
/* ------------------------------------------------------------------ */

describe('classifyDropPayload', () => {
  it('classifies a files-only payload', () => {
    const f = file('photo.jpg');
    const item = makeFileItem(makeFileEntry('photo.jpg', f), f);
    const dt = { items: [item] } as unknown as DataTransfer;

    expect(classifyDropPayload(dt)).toBe('files');
  });

  it('classifies a folders-only payload', () => {
    const dir = makeDirEntry('folder', []);
    const item = makeFileItem(dir, file('dummy.jpg'));
    const dt = { items: [item] } as unknown as DataTransfer;

    expect(classifyDropPayload(dt)).toBe('folders');
  });

  it('classifies a mixed payload', () => {
    const f = file('photo.jpg');
    const dir = makeDirEntry('folder', []);
    const dt = {
      items: [makeFileItem(makeFileEntry('photo.jpg', f), f), makeFileItem(dir, f)],
    } as unknown as DataTransfer;

    expect(classifyDropPayload(dt)).toBe('mixed');
  });

  it('returns unknown for a null dataTransfer', () => {
    expect(classifyDropPayload(null)).toBe('unknown');
  });

  it('returns unknown for empty items', () => {
    const dt = { items: [] } as unknown as DataTransfer;
    expect(classifyDropPayload(dt)).toBe('unknown');
  });
});
