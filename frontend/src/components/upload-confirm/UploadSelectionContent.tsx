import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AlertTriangle, FileImage, ImageOff, X } from 'lucide-react';
import { MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import { formatFileSize } from '../../lib/utils';
import { getFileUploadErrorText, hasFileUploadError } from './uploadConfirmUtils';

interface UploadSelectionContentProps {
  files: File[];
  totalSize: number;
  hasLargeFiles: boolean;
  hasInvalidTypes: boolean;
  renameWarnings: Array<{ original: string; unique: string }>;
  isUploading: boolean;
  onRemoveFile: (fileIndex: number) => void;
}

// ─── Thumbnail engine (Lightweight) ──────────────────────────────────────────
// Instead of full image processing, we just give the browser a pointer to the
// file. Modern browsers handle the decoding efficiently on-demand.

type ThumbStatus = 'ready' | 'error';
interface ThumbEntry {
  url: string | null;
  status: ThumbStatus;
}

/**
 * Super-lightweight thumbnail "engine".
 * We just create a Blob URL once. The browser's image decoder handles
 * the actual work of rendering it into the <img> tag only when visible.
 */
const useThumbnails = (files: File[]) => {
  const entriesRef = useRef(new Map<File, ThumbEntry>());
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Sync entries with the files list
  useEffect(() => {
    const fileSet = new Set(files);
    let changed = false;

    // Remove old ones
    entriesRef.current.forEach((entry, file) => {
      if (!fileSet.has(file)) {
        if (entry.url) URL.revokeObjectURL(entry.url);
        entriesRef.current.delete(file);
        changed = true;
      }
    });

    // Add new ones (instantly, no worker queue)
    files.forEach((file) => {
      if (!entriesRef.current.has(file) && file.type.startsWith('image/')) {
        entriesRef.current.set(file, {
          url: URL.createObjectURL(file), // Just a pointer, 0 CPU used here
          status: 'ready',
        });
        changed = true;
      }
    });

    if (changed) forceUpdate();
  }, [files]);

  // RequestThumb becomes a no-op as URLs are created instantly
  const requestThumb = useCallback(() => { }, []);

  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      entries.forEach((entry) => {
        if (entry.url) URL.revokeObjectURL(entry.url);
      });
      entries.clear();
    };
  }, []);

  return { thumbnails: entriesRef.current, requestThumb };
};

// ─── Skeleton shimmer ────────────────────────────────────────────────────────
const ThumbSkeleton = () => (
  <div className="w-full h-full animate-pulse bg-surface-1 dark:bg-surface-dark-2">
    <div className="w-full h-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
  </div>
);

// ─── Memoized file card ──────────────────────────────────────────────────────
interface FileCardProps {
  file: File;
  index: number;
  thumb: ThumbEntry | undefined;
  isUploading: boolean;
  onRemoveFile: (index: number) => void;
  onVisible: (file: File) => void;
}

const FileCard = memo(
  ({ file, index, thumb, isUploading, onRemoveFile, onVisible }: FileCardProps) => {
    const hasError = hasFileUploadError(file);
    const fileErrorText = getFileUploadErrorText(file);
    // Use IntersectionObserver only to lazy-set the src for native decoding.
    // This further reduces initialization overhead.
    const [shouldLoad, setShouldLoad] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setShouldLoad(true);
            onVisible(file);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' }
      );
      if (cardRef.current) observer.observe(cardRef.current);
      return () => observer.disconnect();
    }, [file, onVisible]);

    const thumbUrl = thumb?.url ?? null;

    return (
      <div
        ref={cardRef}
        className={`relative overflow-hidden rounded-[1.75rem] border transition-all duration-200 group ${hasError
            ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
            : 'bg-surface-1 dark:bg-surface-dark-1 border-border/50 hover:border-accent/30 hover:shadow-lg hover:-translate-y-1'
          }`}
      >
        <div className="relative aspect-4/3 overflow-hidden border-b border-border/40 bg-surface dark:bg-surface-dark-2">
          {/* Skeleton while not yet scrolled into view */}
          {!shouldLoad && <ThumbSkeleton />}

          {/* Thumbnail — use browser-native async decoding */}
          {shouldLoad && thumbUrl && (
            <>
              <img
                src={thumbUrl}
                alt={`Preview of ${file.name}`}
                className={`w-full h-full object-cover animate-in fade-in duration-300 transition-transform group-hover:scale-[1.03] ${hasError ? 'opacity-60 saturate-75' : ''
                  }`}
                decoding="async"
              />
              {hasError && (
                <div className="absolute inset-0 bg-linear-to-t from-red-950/35 via-red-900/10 to-transparent" />
              )}
            </>
          )}

          {/* Fallback image icon if thumb is missing */}
          {shouldLoad && !thumbUrl && (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff
                className={`w-8 h-8 ${hasError ? 'text-red-500 dark:text-red-400' : 'text-muted'}`}
              />
            </div>
          )}

          {/* Status badge */}
          {shouldLoad && (
            <div className="absolute left-3 top-3">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm ${hasError ? 'bg-red-600/85 text-white' : 'bg-emerald-600/85 text-white'
                  }`}
              >
                {hasError ? 'Fix required' : 'Ready'}
              </span>
            </div>
          )}

          {/* Remove button */}
          <button
            onClick={() => onRemoveFile(index)}
            disabled={isUploading}
            aria-label={`Remove ${file.name}`}
            className="absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-black/60 p-2 text-white transition hover:bg-black/75 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <p className="text-base font-bold text-text dark:text-white truncate" title={file.name}>
              {file.name}
            </p>
            <p className="mt-1 text-sm text-muted">
              {formatFileSize(file.size)}
              {file.type && ` • ${file.type.replace('image/', '').toUpperCase()}`}
            </p>
          </div>

          {hasError && fileErrorText && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-start gap-1.5 leading-relaxed">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {fileErrorText}
            </span>
          )}
        </div>
      </div>
    );
  },
);
FileCard.displayName = 'FileCard';

// ─── Main component ──────────────────────────────────────────────────────────
export const UploadSelectionContent = ({
  files,
  totalSize,
  hasLargeFiles,
  hasInvalidTypes,
  renameWarnings,
  isUploading,
  onRemoveFile,
}: UploadSelectionContentProps) => {
  const { thumbnails, requestThumb } = useThumbnails(files);
  const readyFilesCount = files.filter((file) => !hasFileUploadError(file)).length;

  return (
    <div className="space-y-6">
      <div className="rounded-4xl border border-border/50 bg-linear-to-br from-accent/10 via-surface to-surface shadow-sm overflow-hidden">
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] lg:items-center">
          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-bold text-text dark:text-white tracking-tight">
              Review before uploading
            </h3>
            <p className="text-sm sm:text-base text-muted">
              Remove any unwanted photos, then upload.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border/50 bg-surface/80 px-4 py-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Selected
              </p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-text dark:text-white">
                {files.length}
              </p>
            </div>
            <div className="rounded-2xl border border-green-200/70 bg-green-50/80 px-4 py-4 shadow-xs dark:border-green-500/20 dark:bg-green-500/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700 dark:text-green-300">
                Ready
              </p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-300">
                {readyFilesCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface/80 px-4 py-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Total size
              </p>
              <p className="mt-2 text-lg sm:text-2xl font-bold text-text dark:text-white">
                {formatFileSize(totalSize)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {(hasLargeFiles || hasInvalidTypes || renameWarnings.length > 0) && (
        <div className="p-4 sm:p-5 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-3xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <span className="font-bold text-sm text-yellow-800 dark:text-yellow-200 block mb-2 uppercase tracking-[0.14em]">
                Attention
              </span>
              <ul className="text-sm font-medium text-yellow-700 dark:text-yellow-300 space-y-1 ml-4 list-disc">
                {hasLargeFiles && (
                  <li>Files larger than {MAX_UPLOAD_FILE_SIZE_MB}MB will be rejected</li>
                )}
                {hasInvalidTypes && <li>Only JPG and PNG formats are supported</li>}
                {renameWarnings.length > 0 && (
                  <li>
                    Duplicate names will be renamed before upload:
                    <ul className="ml-4 mt-1 space-y-1 list-disc">
                      {renameWarnings.slice(0, 5).map((warning, index) => (
                        <li key={`${warning.original}-${warning.unique}-${index}`}>
                          {warning.original} → {warning.unique}
                        </li>
                      ))}
                      {renameWarnings.length > 5 && (
                        <li>...and {renameWarnings.length - 5} more</li>
                      )}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-text dark:text-white">Selected files</p>
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/50 bg-surface-1/70 px-4 py-2 text-sm font-medium text-muted">
          <FileImage className="w-4 h-4 text-accent" />
          {files.length} item{files.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {files.map((file, index) => (
          <FileCard
            key={`${file.name}-${file.size}-${index}`}
            file={file}
            index={index}
            thumb={thumbnails.get(file)}
            isUploading={isUploading}
            onRemoveFile={onRemoveFile}
            onVisible={requestThumb}
          />
        ))}
      </div>
    </div>
  );
};
