import { formatFileSize } from '../../lib/utils';
import type { UploadProgress } from '../../hooks/usePhotoUpload';

interface UploadProgressContentProps {
  progress: UploadProgress;
}

export const UploadProgressContent = ({ progress }: UploadProgressContentProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
        <div className="shrink-0">
          <div className="w-8 h-8 rounded-full border-4 border-blue-200 dark:border-blue-500/30 border-t-blue-500 dark:border-t-blue-400 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text dark:text-white truncate">{progress.currentFile}</p>
          {progress.currentBatch && progress.totalBatches && (
            <p className="text-xs text-muted">
              Batch {progress.currentBatch} of {progress.totalBatches}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs sm:text-sm text-muted font-medium">
          <span>Progress</span>
          <span>
            {progress.percentage}% • {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)}
          </span>
        </div>
        <div className="w-full bg-surface-foreground dark:bg-surface rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-linear-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-300 shadow-lg shadow-blue-500/25"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
