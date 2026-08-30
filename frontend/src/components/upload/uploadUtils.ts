import type { Accept, FileRejection } from 'react-dropzone';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_TYPES,
  getMaxUploadSizeBytes,
  getUploadContentType,
  isImageUploadFile,
  isVideoUploadFile,
} from '../../constants/upload';

export const MAX_DROPZONE_FILE_SIZE = MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES;

export const ACCEPTED_MIME_TYPES: Accept = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/jpg': ['.jpg'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-m4v': ['.m4v'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
  'video/x-msvideo': ['.avi'],
  'video/mpeg': ['.mpeg', '.mpg'],
  'video/3gpp': ['.3gp'],
};

export const describeUploadRejections = (rejections: FileRejection[]): string => {
  const firstError = rejections[0]?.errors[0]?.message;
  const rejectedCount = rejections.length;
  return `${rejectedCount} file${rejectedCount === 1 ? '' : 's'} skipped${firstError ? `: ${firstError}` : '.'}`;
};

const sourcePathByFile = new WeakMap<File, string>();

const normalizeSourcePath = (rawPath: string | null | undefined): string => {
  if (!rawPath) return '';
  let path = rawPath.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (path.startsWith('/')) path = path.slice(1);
  return path;
};

export const setUploadSourcePath = (file: File, sourcePath: string | null | undefined): void => {
  const normalized = normalizeSourcePath(sourcePath);
  if (!normalized) return;
  sourcePathByFile.set(file, normalized);
};

export const getUploadSourcePath = (file: File): string => {
  const stored = sourcePathByFile.get(file);
  if (stored) return stored;
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizeSourcePath(relative);
};

export const transferUploadSourcePath = (fromFile: File, toFile: File): void => {
  const sourcePath = getUploadSourcePath(fromFile);
  if (sourcePath) setUploadSourcePath(toFile, sourcePath);
};

export const getUploadFileKey = (file: File): string => {
  const sourcePath = getUploadSourcePath(file);
  return [sourcePath, file.name, file.size, file.type, file.lastModified].join('::');
};

export const deduplicateUploadFiles = (files: File[]): File[] => {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = getUploadFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const isSupportedUploadFile = (file: File): boolean =>
  SUPPORTED_UPLOAD_TYPES.includes(getUploadContentType(file));

export const isResizableOversizedImage = (file: File): boolean =>
  isSupportedUploadFile(file) && isImageUploadFile(file) && file.size > MAX_UPLOAD_FILE_SIZE_BYTES;

export const getUploadValidationError = (file: File): string | null => {
  if (!isSupportedUploadFile(file)) {
    return 'Unsupported format. Choose JPG, PNG, or a supported video file.';
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  if (file.size > getMaxUploadSizeBytes(file)) {
    return isVideoUploadFile(file)
      ? `Video exceeds the ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB limit.`
      : `Image exceeds the ${MAX_UPLOAD_FILE_SIZE_MB} MB limit. Resize it before uploading.`;
  }
  return null;
};

export const prepareUploadSelection = (
  currentFiles: File[],
  incomingFiles: File[],
): { files: File[]; duplicateCount: number } => {
  const combined = [...currentFiles, ...incomingFiles];
  const deduplicated = deduplicateUploadFiles(combined);
  const duplicateCount = combined.length - deduplicated.length;
  return {
    files: deduplicated,
    duplicateCount,
  };
};

export type DropPayloadKind = 'files' | 'folders' | 'mixed' | 'unknown';

/**
 * Raised when a dropped directory cannot be fully read (e.g. the browser
 * revokes access mid-traversal). Callers surface a single clear message instead
 * of opening the queue with a misleadingly empty result. The original browser
 * error is preserved on `cause` for diagnostics.
 */
export class DirectoryReadError extends Error {
  constructor(
    message = 'Could not read the dropped folder. Try again.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DirectoryReadError';
  }
}

type AnyEntry = FileSystemEntry & {
  createReader?: () => FileSystemDirectoryReader;
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
};

const getAsEntry = (item: DataTransferItem): FileSystemEntry | null | undefined => {
  const itemAny = item as DataTransferItem & {
    getAsEntry?: () => FileSystemEntry | null;
    webkitGetAsEntry?: () => FileSystemEntry | null;
  };
  const resolver = itemAny.getAsEntry ?? itemAny.webkitGetAsEntry;
  if (typeof resolver !== 'function') return null;
  try {
    return resolver.call(itemAny);
  } catch {
    return undefined;
  }
};

export const classifyDropPayload = (dataTransfer: DataTransfer | null): DropPayloadKind => {
  if (!dataTransfer) return 'unknown';
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0) return 'unknown';
  let hasFiles = false;
  let hasFolders = false;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = getAsEntry(item);
    if (entry === null) {
      hasFiles = true;
      continue;
    }
    if (entry === undefined) continue;
    if (entry.isDirectory) hasFolders = true;
    else hasFiles = true;
  }
  if (hasFiles && hasFolders) return 'mixed';
  if (hasFolders) return 'folders';
  if (hasFiles) return 'files';
  return 'unknown';
};

const readAllEntries = async (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
  const allEntries: FileSystemEntry[] = [];
  const MAX_BATCHES = 10000;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      // `readEntries` is a WebIDL method that requires `this` to be the reader;
      // calling it detached throws "Illegal invocation" in real browsers.
      reader.readEntries(resolve, reject);
    });
    if (entries.length === 0) break;
    allEntries.push(...entries);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return allEntries;
};

const readTopLevelFiles = async (entry: AnyEntry): Promise<File[]> => {
  // Read only the directory's immediate file entries. Nested subdirectories are
  // intentionally skipped: a full recursive walk can be expensive for large
  // trees, so folder intake is top-level only.
  if (typeof entry.createReader !== 'function') return [];
  // A directory-reader failure (createReader/readAllEntries) propagates as the
  // folder-level error path; only individual child read failures are skipped.
  const reader = entry.createReader();
  const entries = await readAllEntries(reader);
  const files: File[] = [];
  for (const child of entries) {
    if (!child.isFile) continue;
    try {
      const file = await readFileEntry(child as AnyEntry);
      setUploadSourcePath(file, child.fullPath);
      files.push(file);
    } catch {
      // A single unreadable file (e.g. access revoked mid-read) is skipped so
      // readable siblings are still returned.
    }
  }
  return files;
};

/**
 * Keep only files that live directly inside the selected folder (top level),
 * dropping files from nested subdirectories. Used by the `webkitdirectory`
 * picker, whose browser-collected `FileList` already contains the whole tree
 * with `webkitRelativePath` populated.
 */
export const filterTopLevelFiles = (files: File[]): File[] =>
  files.filter((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (!relativePath) return true;
    return relativePath.split('/').length <= 2;
  });

const readFileEntry = (entry: AnyEntry): Promise<File> => {
  const fileCallback = entry.file;
  if (typeof fileCallback !== 'function') {
    return Promise.reject(new DirectoryReadError());
  }
  return new Promise((resolve, reject) => {
    try {
      // `file` is a WebIDL method that requires `this` to be the entry. Calling
      // it detached (as a plain function) throws "Illegal invocation" in real
      // browsers, so invoke it with the entry as the receiver.
      fileCallback.call(
        entry,
        (file) => resolve(file),
        (error) => reject(error instanceof Error ? error : new DirectoryReadError()),
      );
    } catch (error) {
      reject(error instanceof Error ? error : new DirectoryReadError());
    }
  });
};

const extractFilesFromItem = async (item: DataTransferItem): Promise<File[]> => {
  const entry = getAsEntry(item);
  // `null` (no Entry API) and `undefined` (the Entry API threw) both fall back
  // to `getAsFile()` so a dropped file is never silently lost.
  if (entry === undefined || entry === null) {
    const file = item.getAsFile();
    return file ? [file] : [];
  }
  if (entry.isDirectory) {
    return readTopLevelFiles(entry as AnyEntry);
  }
  if (entry.isFile) {
    const file = await readFileEntry(entry as AnyEntry);
    setUploadSourcePath(file, entry.fullPath);
    return [file];
  }
  return [];
};

export const extractFilesFromEvent = async (
  event: Event,
): Promise<{ files: File[]; hadDirectory: boolean }> => {
  const target = event.target as HTMLInputElement | null;
  if (target?.files && target.files.length > 0) {
    return { files: Array.from(target.files), hadDirectory: false };
  }

  const dataTransfer = (event as DragEvent).dataTransfer;
  if (!dataTransfer) return { files: [], hadDirectory: false };

  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0) {
    return { files: Array.from(dataTransfer.files ?? []), hadDirectory: false };
  }

  const files: File[] = [];
  let hadDirectory = false;
  try {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      // Resolve the entry only to flag directory drops; `extractFilesFromItem`
      // re-resolves it and falls back to `getAsFile()` when the Entry API is
      // unavailable or throws, so every file item is preserved.
      const entry = getAsEntry(item);
      if (entry && entry.isDirectory) hadDirectory = true;
      const extracted = await extractFilesFromItem(item);
      files.push(...extracted);
    }
  } catch (error) {
    // Preserve the real browser error (e.g. SecurityError) for diagnostics
    // instead of hiding it behind a generic message.
    if (error instanceof DirectoryReadError) throw error;
    throw new DirectoryReadError(undefined, {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
  return { files, hadDirectory };
};
