import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, ImageIcon, Loader2, RotateCw, Shrink, Video, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppBadge } from '../ui';
import { formatFileSize } from '../../lib/utils';
import { createImageThumbnail } from '../../lib/imageThumbnail';
import { isImageUploadFile } from '../../constants/upload';
import { getUploadValidationError } from './uploadUtils';
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
  return (
    <AppBadge tone="neutral" variant="subtle" size="xs">
      Ready
    </AppBadge>
  );
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
  const canResize =
    Boolean(onResize) && isImageUploadFile(job.file) && validationError?.includes('10 MB limit');

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

    void createImageThumbnail(job.file).then((result) => {
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
      className={`group flex min-w-0 items-center gap-3 rounded-2xl bg-surface-1 p-3 shadow-xs dark:bg-surface-dark-1 ${
        visibleError ? 'ring-1 ring-danger/35' : ''
      }`}
      data-upload-job={job.id}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        disabled={reorderDisabled}
        className="inline-flex h-10 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-accent focus:cursor-grabbing focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:hover:bg-surface-dark-2 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={`Reorder ${displayedName}, position ${index + 1} of ${totalCount}`}
        title="Drag or use the keyboard to reorder"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2 dark:bg-surface-dark-2">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Preview of ${job.file.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            {job.file.type.startsWith('video/') ? (
              <Video className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
        )}
        {isResizing && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-white">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold text-text"
            title={displayedName}
          >
            {displayedName}
          </p>
          {statusBadge(job)}
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
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canResize && (
          <button
            type="button"
            onClick={() => onResize?.(job.id)}
            disabled={actionsDisabled || isResizing}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Resize ${job.file.name} to fit size limit`}
          >
            {isResizing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Shrink className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Resize</span>
          </button>
        )}
        {job.status === 'failed' && job.retryable !== false && !validationError && (
          <button
            type="button"
            onClick={() => onRetry(job.id)}
            disabled={retryDisabled}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Retry ${displayedName}`}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Retry</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(job.id)}
          disabled={actionsDisabled}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-[3px] focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={`Remove ${job.file.name}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
};
