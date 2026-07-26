import { formatFileSize } from '../../lib/utils';
import type { UploadProgress } from '../../hooks/usePhotoUpload';

interface UploadProgressContentProps {
  progress: UploadProgress;
  totalCount: number;
}

export const UploadProgressContent = ({ progress, totalCount }: UploadProgressContentProps) => {
  const uploadedCount = progress.successCount ?? 0;
  const failedCount = progress.failedCount ?? 0;
  const completedCount = uploadedCount + failedCount;
  const liveMessage = `${completedCount} of ${totalCount} files processed.${failedCount > 0 ? ` ${failedCount} failed.` : ''}`;
  const activityLabel = progress.currentFile || 'Preparing files';

  return (
    <div data-testid="upload-overall-status" className="space-y-2.5">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 shrink-0 animate-spin rounded-full border-[3px] border-accent/20 border-t-accent"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold text-text">
              Uploading {completedCount} of {totalCount}
            </p>
            <p className="shrink-0 text-sm font-bold tabular-nums text-text">
              {progress.percentage}%
            </p>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 text-xs font-medium text-muted">
            <p className="truncate">{activityLabel}</p>
            <p className="shrink-0 tabular-nums">
              {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)}
            </p>
          </div>
          {failedCount > 0 && (
            <p className="mt-1 text-xs font-semibold text-danger">
              {failedCount} failed — retry will be available when this run finishes.
            </p>
          )}
          {progress.currentBatch && progress.totalBatches && (
            <p className="mt-1 text-xs font-medium text-muted">
              Batch {progress.currentBatch} of {progress.totalBatches}
            </p>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Overall upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentage}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2 dark:bg-surface-dark-2"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
    </div>
  );
};
