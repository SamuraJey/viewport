import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, ImageIcon, Loader2, RotateCw, Shrink, Video, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppBadge } from '../ui';
import { formatFileSize } from '../../lib/utils';
import { createImageThumbnail } from '../../lib/imageThumbnail';
import { isImageUploadFile, isVideoUploadFile } from '../../constants/upload';
import { getUploadValidationError, isResizableOversizedImage } from './uploadUtils';
import type { UploadJob } from './types';

interface UploadQueueItemProps {
  job: UploadJob;
  index: number;
  totalCount: number;
  reorderDisabled: boolean;
  actionsDisabled: boolean;
  retryDisabled: boolean;
  isResizing?: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onResize?: (id: string) => void;
}

const UPLOAD_PREVIEW_MAX_DIMENSION = 480;

const statusBadge = (job: UploadJob) => {
  if (job.status === 'uploading') {
    return (
      <AppBadge tone="info" variant="subtle" size="xs">
        Uploading
      </AppBadge>
    );
  }
  if (job.status === 'success') {
    return (
      <AppBadge tone="success" variant="subtle" size="xs">
        Uploaded
      </AppBadge>
    );
  }
  if (job.status === 'failed') {
    return (
      <AppBadge tone="danger" variant="subtle" size="xs">
        Failed
      </AppBadge>
    );
  }
  return null;
};

export const UploadQueueItem = ({
  job,
  index,
  totalCount,
  reorderDisabled,
  actionsDisabled,
  retryDisabled,
  isResizing = false,
  onRetry,
  onRemove,
  onResize,
}: UploadQueueItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id, disabled: reorderDisabled });
  const rowRef = useRef<HTMLLIElement | null>(null);
  const [shouldLoadThumbnail, setShouldLoadThumbnail] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const validationError = getUploadValidationError(job.file);
  const canResize = Boolean(onResize) && isResizableOversizedImage(job.file);
  const canRetry = job.status === 'failed' && job.retryable !== false && !validationError;
  const isVideo = isVideoUploadFile(job.file);
  const isImage = isImageUploadFile(job.file);

  const setRowRef = useCallback(
    (node: HTMLLIElement | null) => {
      rowRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoadThumbnail(true);
        observer.disconnect();
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoadThumbnail) return;

    let disposed = false;
    let cleanup = () => {};

    void createImageThumbnail(job.file, UPLOAD_PREVIEW_MAX_DIMENSION).then((result) => {
      if (disposed) {
        result.cleanup();
        return;
      }
      cleanup = result.cleanup;
      setThumbnailUrl(result.url);
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [job.file, shouldLoadThumbnail]);

  const visibleError = job.error ?? validationError;
  const displayedName = job.filename || job.file.name;

  return (
    <li
      ref={setRowRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface transition-colors hover:border-accent/40 dark:bg-surface-dark-1 ${
        visibleError ? 'border-danger/35' : 'border-border/40'
      } ${visibleError ? 'ring-1 ring-danger/35' : ''}`}
      data-upload-job={job.id}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          disabled={reorderDisabled}
          className="absolute left-2 top-2 z-20 inline-flex h-10 w-10 touch-none cursor-grab items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80 focus:cursor-grabbing focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={`Reorder ${displayedName}, position ${index + 1} of ${totalCount}`}
          title="Drag or use the keyboard to reorder"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onRemove(job.id)}
          disabled={actionsDisabled}
          className="absolute right-2 top-2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-danger focus:outline-none focus-visible:ring-[3px] focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={`Remove ${displayedName}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Preview of ${displayedName}`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-2 text-muted dark:bg-surface-dark-2">
            {isVideo ? (
              <Video className="h-10 w-10" aria-hidden="true" />
            ) : isImage ? (
              <ImageIcon className="h-10 w-10" aria-hidden="true" />
            ) : null}
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Preparing preview</span>
          </div>
        )}
        {isResizing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 text-white backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            <span className="text-sm font-bold">Resizing preview</span>
          </div>
        )}
        {job.status !== 'queued' && (
          <div className="absolute bottom-2 left-2 z-20">{statusBadge(job)}</div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold text-text"
            title={displayedName}
          >
            {displayedName}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted">
          <span>
            {canResize
              ? `${formatFileSize(job.file.size)} → ≤ 10 MB`
              : formatFileSize(job.file.size)}
          </span>
          {job.renameWarning && (
            <span className="text-warning">Renamed to {job.renameWarning}</span>
          )}
          {job.status === 'uploading' && <span className="tabular-nums">{job.progress}%</span>}
        </div>

        {visibleError && (
          <p className="mt-1.5 text-xs font-semibold leading-5 text-danger">{visibleError}</p>
        )}

        {job.status === 'uploading' && (
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 dark:bg-surface-dark-2"
            role="progressbar"
            aria-label={`Uploading ${displayedName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}

        {(canResize || canRetry) && (
          <div className="mt-auto flex flex-wrap items-center justify-end gap-1 pt-3">
            {canResize && (
              <button
                type="button"
                onClick={() => onResize?.(job.id)}
                disabled={actionsDisabled || isResizing}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={`Resize ${displayedName} to fit size limit`}
              >
                {isResizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Shrink className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Resize</span>
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                onClick={() => onRetry(job.id)}
                disabled={retryDisabled}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={`Retry ${displayedName}`}
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
};
