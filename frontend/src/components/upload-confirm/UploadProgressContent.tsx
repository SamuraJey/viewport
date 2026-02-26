import { formatFileSize } from '../../lib/utils';
import type { UploadProgress } from '../../hooks/usePhotoUpload';

interface UploadProgressContentProps {
  progress: UploadProgress;
}

export const UploadProgressContent = ({ progress }: UploadProgressContentProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5 p-5 rounded-2xl bg-accent/5 border border-accent/20 shadow-xs relative overflow-hidden">
        {/* Animated background stripes */}
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-accent/5 to-transparent" />

        <div className="shrink-0 relative z-10">
          <div className="w-12 h-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <p className="text-lg font-bold text-text dark:text-white truncate">
            {progress.currentFile || 'Initiating upload...'}
          </p>
          {progress.currentBatch && progress.totalBatches && (
            <p className="text-sm font-medium text-muted mt-1">
              Batch {progress.currentBatch} of {progress.totalBatches}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-muted font-bold tracking-wide uppercase">
          <span>Uploading...</span>
          <span className="text-text tabular-nums">
            {progress.percentage}% • {formatFileSize(progress.loaded)} /{' '}
            {formatFileSize(progress.total)}
          </span>
        </div>
        <div className="w-full bg-surface-1 dark:bg-surface-dark-1 rounded-full h-4 overflow-hidden border border-border/50 shadow-inner">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300 shadow-sm relative overflow-hidden"
            style={{ width: `${progress.percentage}%` }}
          >
            <div
              className="absolute inset-0 bg-linear-to-r from-white/0 via-white/20 to-white/0"
              style={{ backgroundSize: '200% 100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
