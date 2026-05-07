import { AlertTriangle, Upload } from 'lucide-react';
import type { PhotoUploadResponse } from '../../services/photoService';

interface CancelWarningProps {
  isUploading: boolean;
  onConfirmClose: () => void;
  onCancelClose: () => void;
}

export const UploadCancelWarning = ({
  isUploading,
  onConfirmClose,
  onCancelClose,
}: CancelWarningProps) => (
  <div className="px-5 sm:px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 animate-in fade-in slide-in-from-top-2">
    <div className="flex items-center gap-2 text-red-800 dark:text-red-200 mb-3">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <span className="font-semibold text-sm sm:text-base">
        {isUploading ? 'Cancel Upload?' : 'Close Window?'}
      </span>
    </div>
    <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mb-4 ml-7">
      {isUploading
        ? 'Are you sure you want to cancel? In-progress uploads will be stopped.'
        : 'Are you sure? Your selected files will not be uploaded.'}
    </p>
    <div className="flex gap-2 ml-7">
      <button
        type="button"
        onClick={onConfirmClose}
        className="px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:bg-red-700 transition-all duration-200 active:scale-95"
      >
        {isUploading ? 'Yes, Cancel' : 'Yes, Close'}
      </button>
      <button
        type="button"
        onClick={onCancelClose}
        className="px-3 sm:px-4 py-2 bg-surface-foreground dark:bg-surface text-text dark:text-muted text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
      >
        {isUploading ? 'Continue' : 'Stay'}
      </button>
    </div>
  </div>
);

interface UploadModalFooterProps {
  result: PhotoUploadResponse | null;
  isUploading: boolean;
  failedCount: number;
  validUploadCount: number;
  hasValidFiles: boolean;
  onRetryFailed: () => void;
  onClose: () => void;
  onCancel: () => void;
  onUpload: () => void;
  uploadButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export const UploadModalFooter = ({
  result,
  isUploading,
  failedCount,
  validUploadCount,
  hasValidFiles,
  onRetryFailed,
  onClose,
  onCancel,
  onUpload,
  uploadButtonRef,
}: UploadModalFooterProps) => (
  <div className="sticky bottom-0 flex justify-between items-center gap-4 border-t border-border/40 bg-surface/95 px-5 py-4 backdrop-blur-md sm:px-6 dark:bg-surface-foreground/95">
    {/* Left side text */}
    <div className="text-sm font-medium">
      {!result ? (
        <span className={hasValidFiles ? 'text-text' : 'text-muted'}>
          {hasValidFiles ? `${validUploadCount} ready to upload` : 'No valid files to upload'}
        </span>
      ) : (
        <span
          className={
            failedCount === 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-yellow-600 dark:text-yellow-400'
          }
        >
          {failedCount === 0 ? 'All finished successfully' : `${failedCount} failed to upload`}
        </span>
      )}
    </div>

    {/* Actions */}
    <div className="flex flex-wrap items-center justify-end gap-3">
      {result && (
        <>
          {failedCount > 0 && (
            <button
              type="button"
              onClick={onRetryFailed}
              disabled={isUploading}
              className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2 text-sm font-medium text-text transition-all duration-200 hover:bg-surface-2 active:scale-95 disabled:opacity-50 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
            >
              <Upload className="w-4 h-4" />
              Retry {failedCount}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-xl transition-all duration-200 active:scale-95"
          >
            Done
          </button>
        </>
      )}

      {!result && (
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="px-5 py-2.5 bg-transparent hover:bg-surface-1 dark:hover:bg-surface-dark-1 text-muted hover:text-text dark:hover:text-white text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            ref={uploadButtonRef}
            onClick={onUpload}
            disabled={!hasValidFiles || isUploading}
            className="flex min-w-30 items-center justify-center gap-2 rounded-xl bg-text px-5 py-2.5 text-sm font-medium text-surface shadow-xs transition-all duration-200 hover:bg-text/90 focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-surface-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!isUploading && <Upload className="w-4 h-4" />}
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </>
      )}
    </div>
  </div>
);
