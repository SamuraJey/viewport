import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Images, Upload, X } from 'lucide-react';
import type { PhotoUploadResponse } from '../services/photoService';
import { usePhotoUpload } from '../hooks';
import { UploadSelectionContent } from './upload-confirm/UploadSelectionContent';
import { UploadProgressContent } from './upload-confirm/UploadProgressContent';
import { UploadResultContent } from './upload-confirm/UploadResultContent';
import { UploadCancelWarning, UploadModalFooter } from './upload-confirm/UploadModalActions';

interface PhotoUploadConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  existingFilenames?: string[];
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  onFilesChange?: (files: File[]) => void;
}

export const PhotoUploadConfirmModal = memo(
  ({
    isOpen,
    onClose,
    files,
    existingFilenames = [],
    galleryId,
    onUploadComplete,
    onFilesChange,
  }: PhotoUploadConfirmModalProps) => {
    const {
      isUploading,
      progress,
      result,
      setResult,
      totalSize,
      hasLargeFiles,
      validUploadCount,
      hasValidFiles,
      hasInvalidTypes,
      renameWarnings,
      handleRemoveFile,
      handleUpload,
      handleRetryFailed,
      cancelUpload,
      failedFilesRef,
    } = usePhotoUpload(galleryId, files, existingFilenames, onFilesChange);

    const [showCancelWarning, setShowCancelWarning] = useState(false);
    const uploadButtonRef = useRef<HTMLButtonElement>(null);
    const isCancelledRef = useRef(false);

    // Focus management when modal opens
    useEffect(() => {
      if (isOpen) {
        // Focus upload button after modal opens
        const timer = setTimeout(() => {
          uploadButtonRef.current?.focus();
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [isOpen]);

    // Force close modal (used after warning confirmation)
    const handleForceClose = useCallback(() => {
      // Mark as cancelled
      isCancelledRef.current = true;
      cancelUpload();
      setShowCancelWarning(false);
      onClose();
    }, [onClose, cancelUpload]);

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

    // Close modal and clean up
    const handleClose = () => {
      if (result) {
        // Upload is complete - call onUploadComplete and close
        onUploadComplete(result);
        onClose();
        setResult(null);
        setShowCancelWarning(false);
      } else {
        // Show confirmation before closing
        handleCancelAttempt();
      }
    };

    const handleBackdropClick = (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        handleCancelAttempt();
      }
    };

    const modalTitle = result
      ? 'Upload complete'
      : isUploading
        ? 'Uploading your photos'
        : 'Review and upload photos';

    const modalSubtitle = result
      ? 'Check the result and close the window when you are ready.'
      : isUploading
        ? 'Keep this window open while the selected files are transferred.'
        : `${validUploadCount} of ${files.length} file${files.length !== 1 ? 's' : ''} ready to upload.`;

    if (!isOpen) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        />

        <motion.div
          className="relative my-4 sm:my-8 flex w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-border/50 bg-surface/95 shadow-2xl backdrop-blur-xl dark:border-border/20 dark:bg-surface-foreground/95"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-border/50 bg-linear-to-r from-surface via-surface to-accent/5 px-5 py-5 backdrop-blur-md sm:px-7 sm:py-6 dark:from-surface-foreground dark:via-surface-foreground dark:to-accent/10">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-surface/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted dark:bg-surface-dark-1/70">
                    {result ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : isUploading ? (
                      <Upload className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <Images className="h-3.5 w-3.5 text-accent" />
                    )}
                    {result ? 'Done' : isUploading ? 'In progress' : 'Ready to review'}
                  </span>
                  {!result && (
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      {files.length} file{files.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-text dark:text-white tracking-tight">
                    {modalTitle}
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm sm:text-base text-muted">
                    {modalSubtitle}
                  </p>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-surface/80 text-muted transition-all duration-200 hover:scale-[1.03] hover:text-text hover:shadow-sm dark:bg-surface-dark-1/70 dark:hover:text-white"
                aria-label="Close upload dialog"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* Cancel Warning */}
          {showCancelWarning && (
            <UploadCancelWarning
              isUploading={isUploading}
              onConfirmClose={handleForceClose}
              onCancelClose={() => setShowCancelWarning(false)}
            />
          )}

          {/* Content */}
          <div
            data-lenis-prevent
            className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-7 lg:py-7 max-h-[calc(100vh-14rem)]"
          >
            {!result && !isUploading && (
              <UploadSelectionContent
                files={files}
                totalSize={totalSize}
                hasLargeFiles={hasLargeFiles}
                hasInvalidTypes={hasInvalidTypes}
                renameWarnings={renameWarnings}
                isUploading={isUploading}
                onRemoveFile={handleRemoveFile}
              />
            )}

            {/* Upload progress */}
            {isUploading && progress && <UploadProgressContent progress={progress} />}

            {/* Upload results */}
            {result && <UploadResultContent result={result} />}
          </div>

          {/* Footer */}
          <UploadModalFooter
            result={result}
            isUploading={isUploading}
            failedCount={failedFilesRef.current.length}
            validUploadCount={validUploadCount}
            hasValidFiles={hasValidFiles}
            filesCount={files.length}
            onRetryFailed={handleRetryFailed}
            onClose={handleClose}
            onCancel={handleClose}
            onUpload={handleUpload}
            uploadButtonRef={uploadButtonRef}
          />
        </motion.div>
      </div>
    );
  },
);

PhotoUploadConfirmModal.displayName = 'PhotoUploadConfirmModal';
