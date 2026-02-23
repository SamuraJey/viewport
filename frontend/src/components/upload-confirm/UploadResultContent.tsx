import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { PhotoUploadResponse } from '../../services/photoService';

interface UploadResultContentProps {
  result: PhotoUploadResponse;
}

export const UploadResultContent = ({ result }: UploadResultContentProps) => {
  const failedResults = result.results.filter((item) => !item.success);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-linear-to-r from-green-50 to-green-50/50 dark:from-green-500/10 dark:to-green-500/5 border border-green-200 dark:border-green-500/20">
        <div className="shrink-0">
          {result.failed_uploads === 0 ? (
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <div>
          <p className="font-bold text-sm sm:text-base text-text dark:text-white">
            {result.failed_uploads === 0 ? 'All Files Uploaded!' : 'Upload Complete'}
          </p>
          <p className="text-xs text-muted">
            {result.successful_uploads} successful
            {result.failed_uploads > 0 && ` • ${result.failed_uploads} failed`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {result.successful_uploads}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">Successful</p>
        </div>
        <div
          className={`p-3 rounded-lg text-center border ${
            result.failed_uploads > 0
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
              : 'bg-surface-foreground dark:bg-surface border-border'
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              result.failed_uploads > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'
            }`}
          >
            {result.failed_uploads}
          </p>
          <p
            className={`text-xs mt-1 ${
              result.failed_uploads > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted'
            }`}
          >
            Failed
          </p>
        </div>
      </div>

      {failedResults.length > 0 && (
        <div className="space-y-2 max-h-32 overflow-y-auto">
          <p className="text-sm font-semibold text-text dark:text-white">Failed uploads:</p>
          {failedResults.map((failedResult, index) => (
            <div
              key={`${failedResult.filename}-${index}`}
              className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20"
            >
              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text dark:text-white truncate">
                  {failedResult.filename}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">{failedResult.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
