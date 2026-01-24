import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { X, Upload, FileImage, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { formatFileSize } from '../lib/utils';
import { photoService } from '../services/photoService';
import type { PhotoUploadResponse } from '../services/photoService';

interface PhotoUploadConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  onFilesChange?: (files: File[]) => void;
}

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentFile: string;
  currentBatch?: number;
  totalBatches?: number;
  successCount?: number;
  failedCount?: number;
}

interface PhotoItemProps {
  file: File;
  preview: string | undefined;
  isUploading: boolean;
  onRemove: (fileName: string) => void;
  formatFileSize: typeof formatFileSize;
}

const PhotoItem = memo(
  ({ file, preview, isUploading, onRemove, formatFileSize }: PhotoItemProps) => {
    const isLarge = file.size > 10 * 1024 * 1024;
    const isInvalid = !['image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
    const hasError = isLarge || isInvalid;

    return (
      <div
        className={`relative group flex flex-col h-full rounded-lg overflow-hidden transition-all duration-200 ${
          hasError
            ? 'ring-2 ring-red-400 dark:ring-red-500'
            : 'ring-2 ring-border hover:ring-blue-400 dark:hover:ring-blue-500'
        }`}
      >
        <div className="flex-1 w-full bg-surface-foreground dark:bg-surface flex items-center justify-center overflow-hidden">
          {preview ? (
            <img
              src={preview}
              alt={file.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <FileImage className="w-12 h-12 text-muted" />
          )}
        </div>

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
          <button
            onClick={() => onRemove(file.name)}
            disabled={isUploading}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove from upload"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {hasError && (
          <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1.5 z-10">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
        )}

        <div className="bg-black/70 text-white p-3 min-h-15 flex flex-col justify-center">
          <p className="text-sm font-semibold truncate wrap-break-word line-clamp-2">{file.name}</p>
          <p className="text-xs text-gray-300 mt-1">{formatFileSize(file.size)}</p>
        </div>
      </div>
    );
  },
);
PhotoItem.displayName = 'PhotoItem';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const PhotoUploadConfirmModal = ({
  isOpen,
  onClose,
  files,
  galleryId,
  onUploadComplete,
  onFilesChange,
}: PhotoUploadConfirmModalProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<PhotoUploadResponse | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);
  const failedFilesRef = useRef<File[]>([]);

  // Handle modal animation
  useEffect(() => {
    if (isOpen) {
      setShowModal(true);
      // Focus upload button after modal opens
      const timer = setTimeout(() => {
        uploadButtonRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowModal(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Force close modal (used after warning confirmation)
  const handleForceClose = useCallback(() => {
    // Mark as cancelled
    isCancelledRef.current = true;
    // Cancel ongoing uploads
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Clean up file previews
    setProgress(null);
    setResult(null);
    setIsUploading(false);
    setShowModal(false);
    setShowCancelWarning(false);
    onClose();
  }, [onClose]);

  // Handle cancel attempt - show warning first, then close on second attempt
  const handleCancelAttempt = useCallback(() => {
    if (showCancelWarning) {
      // Second attempt - close modal
      handleForceClose();
    } else {
      // First attempt - show warning
      setShowCancelWarning(true);
    }
  }, [showCancelWarning, handleForceClose]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancelAttempt();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isUploading, showCancelWarning, result, handleCancelAttempt]);

  if (!isOpen && !showModal) return null;

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const hasLargeFiles = files.some((file) => file.size > 10 * 1024 * 1024);
  const validUploadCount = files.filter(
    (file) => file.size <= 10 * 1024 * 1024 && SUPPORTED_TYPES.includes(file.type),
  ).length;
  const hasValidFiles = validUploadCount > 0;
  const hasInvalidTypes = files.some((file) => !SUPPORTED_TYPES.includes(file.type));

  // Handle file removal
  const handleRemoveFile = (fileName: string) => {
    const updatedFiles = files.filter((f) => f.name !== fileName);
    onFilesChange?.(updatedFiles);
  };

  const handleUpload = async () => {
    if (!hasValidFiles) return;
    setIsUploading(true);
    setProgress(null);
    setResult(null);
    failedFilesRef.current = [];

    // Create new AbortController for this upload
    abortControllerRef.current = new AbortController();

    try {
      // Use presigned upload (direct to S3)
      const result = await photoService.uploadPhotosPresigned(
        galleryId,
        files,
        setProgress,
        abortControllerRef.current.signal,
      );

      // Track failed files for potential retry
      failedFilesRef.current = result.results
        .filter((r) => !r.success && r.retryable !== false)
        .map((r) => files.find((f) => f.name === r.filename))
        .filter((f) => f !== undefined) as File[];

      setResult(result);
      // Don't call onUploadComplete here - wait for user to close the modal
    } catch (error) {
      // Only show error if it's not a cancellation
      if (!(error instanceof Error && error.message.includes('cancelled'))) {
        console.error('Upload failed:', error);
        setResult({
          results: files.map((file) => ({
            filename: file.name,
            success: false,
            error: 'Upload failed',
          })),
          total_files: files.length,
          successful_uploads: 0,
          failed_uploads: files.length,
        });
        failedFilesRef.current = files;
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleRetryFailed = async () => {
    if (failedFilesRef.current.length === 0) return;

    setIsUploading(true);
    setProgress(null);
    setResult(null);

    // Create new AbortController for this retry
    abortControllerRef.current = new AbortController();

    try {
      const result = await photoService.retryFailedUploads(
        galleryId,
        failedFilesRef.current,
        setProgress,
        abortControllerRef.current.signal,
      );

      // Update result with new attempt
      if (result.failed_uploads > 0) {
        failedFilesRef.current = failedFilesRef.current.filter((file) =>
          result.results.some((r) => r.filename === file.name && !r.success),
        );
      } else {
        failedFilesRef.current = [];
      }

      setResult(result);
    } catch (error) {
      console.error('Retry failed:', error);
      setResult({
        results: failedFilesRef.current.map((file) => ({
          filename: file.name,
          success: false,
          error: 'Retry failed',
        })),
        total_files: failedFilesRef.current.length,
        successful_uploads: 0,
        failed_uploads: failedFilesRef.current.length,
      });
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Close modal and clean up
  const handleClose = () => {
    if (result) {
      // Upload is complete - call onUploadComplete and close
      onUploadComplete(result);
      onClose();
      setResult(null);
      setProgress(null);
      setShowCancelWarning(false);
    } else {
      // Show confirmation before closing
      handleCancelAttempt();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancelAttempt();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto transition-all duration-200 pt-4 sm:pt-8 ${
        isOpen
          ? 'bg-black/50 backdrop-blur-sm'
          : 'bg-transparent backdrop-blur-0 pointer-events-none'
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-surface dark:bg-surface-foreground rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-3 sm:mx-4 mb-6 sm:mb-8 transition-all duration-200 transform ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border bg-linear-to-r from-surface to-surface/50 dark:from-surface-foreground dark:to-surface-foreground/50">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-text dark:text-white">
              {result
                ? '✓ Upload Complete'
                : isUploading
                  ? 'Uploading Photos...'
                  : 'Confirm Photo Upload'}
            </h2>
            {!result && !isUploading && (
              <p className="text-xs sm:text-sm text-muted mt-1">
                Review your files before uploading
              </p>
            )}
          </div>
          {!isUploading && result && (
            <button
              onClick={handleClose}
              className="p-2 text-muted hover:text-text dark:text-muted dark:hover:text-accent-foreground transition-all duration-200 hover:scale-110 hover:bg-surface-foreground dark:hover:bg-surface rounded-lg"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}
        </div>

        {/* Cancel Warning */}
        {showCancelWarning && (
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
                onClick={handleForceClose}
                className="px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:bg-red-700 transition-all duration-200 active:scale-95"
              >
                {isUploading ? 'Yes, Cancel' : 'Yes, Close'}
              </button>
              <button
                onClick={() => setShowCancelWarning(false)}
                className="px-3 sm:px-4 py-2 bg-surface-foreground dark:bg-surface text-text dark:text-muted text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              >
                {isUploading ? 'Continue' : 'Stay'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-96 space-y-4">
          {!result && !isUploading && (
            <>
              {/* Warning messages */}
              {(hasLargeFiles || hasInvalidTypes) && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <span className="font-semibold text-sm text-yellow-800 dark:text-yellow-200 block mb-2">
                        ⚠ Warning
                      </span>
                      <ul className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                        {hasLargeFiles && <li>• Files larger than 10MB will be rejected</li>}
                        {hasInvalidTypes && <li>• Only JPG and PNG formats are supported</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Files summary */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                <div className="shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                  <FileImage className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-text dark:text-white">
                    {files.length} Photo{files.length !== 1 ? 's' : ''} Selected
                  </p>
                  <p className="text-xs text-muted">Total size: {formatFileSize(totalSize)}</p>
                </div>
              </div>

              {/* Files list */}
              <div className="space-y-2">
                {files.map((file, index) => {
                  const isLarge = file.size > 10 * 1024 * 1024;
                  const isInvalid = !['image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
                  const hasError = isLarge || isInvalid;

                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-200 group ${
                        hasError
                          ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
                          : 'bg-surface-foreground dark:bg-surface border border-border hover:border-blue-300 dark:hover:border-blue-500/30'
                      }`}
                    >
                      {/* File icon */}
                      <div className="shrink-0 w-10 h-10 rounded-lg bg-surface dark:bg-surface-foreground flex items-center justify-center">
                        <FileImage
                          className={`w-5 h-5 ${
                            hasError
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-blue-500 dark:text-blue-400'
                          }`}
                        />
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-text dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
                        {hasError && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                            {isLarge && '⚠ File too large (max 10MB)'}
                            {isInvalid && isLarge && ' • '}
                            {isInvalid && 'Invalid format (JPG/PNG only)'}
                          </p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemoveFile(file.name)}
                        disabled={isUploading}
                        className="shrink-0 p-2 opacity-0 group-hover:opacity-100 transition-all duration-200 text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove file"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Upload progress */}
          {isUploading && progress && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full border-4 border-blue-200 dark:border-blue-500/30 border-t-blue-500 dark:border-t-blue-400 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text dark:text-white truncate">
                    {progress.currentFile}
                  </p>
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
                    {progress.percentage}% • {formatFileSize(progress.loaded)} /{' '}
                    {formatFileSize(progress.total)}
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
          )}

          {/* Upload results */}
          {result && (
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

              {result.results.filter((r) => !r.success).length > 0 && (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  <p className="text-sm font-semibold text-text dark:text-white">Failed uploads:</p>
                  {result.results
                    .filter((r) => !r.success)
                    .map((r, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20"
                      >
                        <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text dark:text-white truncate">
                            {r.filename}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400">{r.error}</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 sm:gap-3 p-5 sm:p-6 border-t border-border bg-linear-to-r from-surface/50 to-surface dark:from-surface-foreground/50 dark:to-surface-foreground">
          {result && (
            <>
              {failedFilesRef.current.length > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={isUploading}
                  className="px-4 sm:px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-surface-foreground disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:focus:ring-offset-surface-foreground"
                >
                  <Upload className="w-4 h-4" />
                  Retry {failedFilesRef.current.length}
                </button>
              )}
              <button
                onClick={handleClose}
                className="px-4 sm:px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-surface-foreground"
              >
                Close
              </button>
            </>
          )}
          {!result && !isUploading && (
            <>
              <button
                onClick={() => onClose()}
                className="px-4 sm:px-6 py-2.5 text-muted dark:text-text hover:bg-surface dark:hover:bg-surface-foreground text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              >
                Cancel
              </button>
              <button
                ref={uploadButtonRef}
                onClick={handleUpload}
                disabled={files.length === 0 || !hasValidFiles}
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
      </div>
    </div>
  );
};
