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
        onClick={onConfirmClose}
        className="px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:bg-red-700 transition-all duration-200 active:scale-95"
      >
        {isUploading ? 'Yes, Cancel' : 'Yes, Close'}
      </button>
      <button
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
  filesCount: number;
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
  filesCount,
  onRetryFailed,
  onClose,
  onCancel,
  onUpload,
  uploadButtonRef,
}: UploadModalFooterProps) => (
  <div className="flex justify-end gap-2 sm:gap-3 p-5 sm:p-6 border-t border-border bg-linear-to-r from-surface/50 to-surface dark:from-surface-foreground/50 dark:to-surface-foreground">
    {result && (
      <>
        {failedCount > 0 && (
          <button
            onClick={onRetryFailed}
            disabled={isUploading}
            className="px-4 sm:px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-surface-foreground disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:focus:ring-offset-surface-foreground"
          >
            <Upload className="w-4 h-4" />
            Retry {failedCount}
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 sm:px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-surface-foreground"
        >
          Close
        </button>
      </>
    )}

    {!result && !isUploading && (
      <>
        <button
          onClick={onCancel}
          className="px-4 sm:px-6 py-2.5 text-muted dark:text-text hover:bg-surface dark:hover:bg-surface-foreground text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
        >
          Cancel
        </button>
        <button
          ref={uploadButtonRef}
          onClick={onUpload}
          disabled={filesCount === 0 || !hasValidFiles}
          className="px-4 sm:px-6 py-2.5 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-surface-foreground disabled:to-surface-foreground disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:shadow-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-surface-foreground"
        >
          <Upload className="w-4 h-4" />
          Upload {validUploadCount}
        </button>
      </>
    )}

    {isUploading && (
      <div className="flex items-center gap-2 text-muted text-xs sm:text-sm">
        <div className="w-4 h-4 border-2 border-muted border-t-text rounded-full animate-spin" />
        Upload in progress...
      </div>
    )}
  </div>
);
