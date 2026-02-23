import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
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
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  onFilesChange?: (files: File[]) => void;
}

export const PhotoUploadConfirmModal = memo(
  ({
    isOpen,
    onClose,
    files,
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
      handleRemoveFile,
      handleUpload,
      handleRetryFailed,
      cancelUpload,
      failedFilesRef,
    } = usePhotoUpload(galleryId, files, onFilesChange);

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

    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-4 sm:pt-8 p-4"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        />

        <motion.div
          className="relative bg-surface dark:bg-surface-foreground rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mb-6 sm:mb-8 border border-border dark:border-border/20"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
            <UploadCancelWarning
              isUploading={isUploading}
              onConfirmClose={handleForceClose}
              onCancelClose={() => setShowCancelWarning(false)}
            />
          )}

          {/* Content */}
          <div data-lenis-prevent className="p-5 sm:p-6 overflow-y-auto max-h-96 space-y-4">
            {!result && !isUploading && (
              <UploadSelectionContent
                files={files}
                totalSize={totalSize}
                hasLargeFiles={hasLargeFiles}
                hasInvalidTypes={hasInvalidTypes}
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
            onCancel={onClose}
            onUpload={handleUpload}
            uploadButtonRef={uploadButtonRef}
          />
        </motion.div>
      </div>
    );
  },
);

PhotoUploadConfirmModal.displayName = 'PhotoUploadConfirmModal';
