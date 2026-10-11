import { TriangleAlert, CircleCheck } from 'lucide-react';
import type { PhotoUploadResponse } from '../../types';

interface UploadResultContentProps {
  result: PhotoUploadResponse;
}

export const UploadResultContent = ({ result }: UploadResultContentProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-5 rounded-xl bg-linear-to-r from-green-50 to-green-50/50 dark:from-green-500/10 dark:to-green-500/5 border border-green-200 dark:border-green-500/20 shadow-xs">
        <div className="shrink-0">
          {result.failed_uploads === 0 ? (
            <CircleCheck className="w-10 h-10 text-green-600 dark:text-green-400" />
          ) : (
            <TriangleAlert className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <div>
          <p className="text-base font-bold text-text sm:text-lg">
            {result.failed_uploads === 0 ? 'All Files Uploaded!' : 'Upload Complete'}
          </p>
          <p className="text-sm text-muted mt-0.5">
            {result.successful_uploads} successful
            {result.failed_uploads > 0 && ` • ${result.failed_uploads} failed`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-center shadow-xs">
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
            {result.successful_uploads}
          </p>
          <p className="text-sm font-medium text-green-700 dark:text-green-300 mt-1">Successful</p>
        </div>
        <div
          className={`p-4 rounded-xl text-center border shadow-xs ${
            result.failed_uploads > 0
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
              : 'bg-surface-foreground dark:bg-surface border-border'
          }`}
        >
          <p
            className={`text-3xl font-bold ${
              result.failed_uploads > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'
            }`}
          >
            {result.failed_uploads}
          </p>
          <p
            className={`text-sm font-medium mt-1 ${
              result.failed_uploads > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted'
            }`}
          >
            Failed
          </p>
        </div>
      </div>
    </div>
  );
};
