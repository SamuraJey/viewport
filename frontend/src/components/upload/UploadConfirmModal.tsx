import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { AlertTriangle, CheckCircle2, Images, Loader2, Shrink, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PhotoUploadResponse } from '../../types';
import { usePhotoUpload } from '../../hooks/usePhotoUpload';
import { resizeImageForUpload } from '../../lib/imageResize';
import { formatFileSize } from '../../lib/utils';
import { MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import { isResizableOversizedImage } from './uploadUtils';
import { PasteHandler } from './PasteHandler';
import { UploadQueueList } from './UploadQueueList';
import { UploadProgressContent } from '../upload-confirm/UploadProgressContent';
import { UploadResultContent } from '../upload-confirm/UploadResultContent';
import { UploadCancelWarning } from '../upload-confirm/UploadModalActions';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';

export interface UploadConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  existingFilenames?: string[];
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  onFilesAdded?: (files: File[]) => number | void;
  onFilesChange?: (files: File[]) => void;
  onModalStateChange?: (isOpen: boolean) => void;
  onBusyChange?: (isBusy: boolean) => void;
}

const showCompletionToast = (result: PhotoUploadResponse) => {
  if (result.failed_uploads === 0) {
    toast.success('Upload complete', {
      description: `${result.successful_uploads} of ${result.total_files} file${result.total_files === 1 ? '' : 's'} uploaded successfully.`,
    });
    return;
  }
  if (result.successful_uploads > 0) {
    toast.warning('Upload finished with issues', {
      description: `${result.successful_uploads} uploaded and ${result.failed_uploads} need attention.`,
    });
    return;
  }
  toast.error('Upload failed', {
    description: `None of the ${result.total_files} files could be uploaded. Retry files individually below.`,
  });
};

export const UploadConfirmModal = memo(
  ({
    isOpen,
    onClose,
    files,
    existingFilenames = [],
    galleryId,
    onUploadComplete,
    onFilesAdded,
    onFilesChange,
    onModalStateChange,
    onBusyChange,
  }: UploadConfirmModalProps) => {
    const {
      isUploading,
      progress,
      result,
      setResult,
      jobs,
      totalSize,
      validUploadCount,
      hasValidFiles,
      handleRemoveJob,
      handleReorderJobs,
      handleReplaceJob,
      handleUpload,
      handleRetryFile,
      cancelUpload,
    } = usePhotoUpload(galleryId, files, existingFilenames, onFilesChange);
    const [showCancelWarning, setShowCancelWarning] = useState(false);
    const [resizingJobId, setResizingJobId] = useState<string | null>(null);
    const [isResizingAll, setIsResizingAll] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const uploadButtonRef = useRef<HTMLButtonElement>(null);
    const isActiveRef = useRef(true);

    const resizableJobs = useMemo(
      () => jobs.filter((job) => isResizableOversizedImage(job.file)),
      [jobs],
    );
    const intakeDisabled =
      !onFilesAdded || isUploading || isResizingAll || resizingJobId !== null || Boolean(result);
    const handlePaste = useCallback(
      (pastedFiles: File[]) => {
        const stagedCount = onFilesAdded?.(pastedFiles) ?? 0;
        if (stagedCount === 0) return;
        toast.info(`${stagedCount} file${stagedCount === 1 ? '' : 's'} pasted`, {
          description:
            stagedCount === 1 && pastedFiles.length === 1
              ? pastedFiles[0]?.name
              : 'Added to the current upload queue from the clipboard.',
        });
      },
      [onFilesAdded],
    );

    const handleDragOver = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        if (intakeDisabled) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
      },
      [intakeDisabled],
    );

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        if (intakeDisabled || event.dataTransfer.files.length === 0) return;
        onFilesAdded?.(Array.from(event.dataTransfer.files));
      },
      [intakeDisabled, onFilesAdded],
    );

    useEffect(() => {
      onBusyChange?.(isUploading || isResizingAll || resizingJobId !== null);
    }, [isResizingAll, isUploading, onBusyChange, resizingJobId]);

    useEffect(
      () => () => {
        isActiveRef.current = false;
        onBusyChange?.(false);
      },
      [onBusyChange],
    );

    const handleForceClose = useCallback(async () => {
      isActiveRef.current = false;
      const partialResult = await cancelUpload();
      setShowCancelWarning(false);
      if (partialResult) {
        onUploadComplete(partialResult);
      }
      onClose();
      onModalStateChange?.(false);
    }, [cancelUpload, onClose, onModalStateChange, onUploadComplete]);

    const handleClose = useCallback(() => {
      if (result && !isUploading) {
        showCompletionToast(result);
        onUploadComplete(result);
        setResult(null);
        setShowCancelWarning(false);
        onClose();
        onModalStateChange?.(false);
        return;
      }
      if (files.length === 0) {
        onClose();
        onModalStateChange?.(false);
        return;
      }
      setShowCancelWarning(true);
    }, [
      files.length,
      isUploading,
      onClose,
      onModalStateChange,
      onUploadComplete,
      result,
      setResult,
    ]);

    const handleResize = useCallback(
      async (jobId: string) => {
        const job = jobs.find((candidate) => candidate.id === jobId);
        if (!job) return;
        setResizingJobId(jobId);
        try {
          const resized = await resizeImageForUpload(job.file);
          if (!isActiveRef.current) return;
          handleReplaceJob(jobId, resized);
        } catch (error) {
          if (!isActiveRef.current) return;
          toast.error(`Could not resize ${job.file.name}`, {
            description: error instanceof Error ? error.message : 'Try a smaller source file.',
          });
        } finally {
          if (isActiveRef.current) setResizingJobId(null);
        }
      },
      [handleReplaceJob, jobs],
    );

    const handleResizeAll = useCallback(async () => {
      if (isResizingAll || resizableJobs.length === 0) return;
      setIsResizingAll(true);
      const workingFiles = [...files];
      try {
        for (const job of resizableJobs) {
          if (!isActiveRef.current) break;
          const index = workingFiles.findIndex((file) => file === job.file);
          if (index < 0) continue;
          setResizingJobId(job.id);
          try {
            const resized = await resizeImageForUpload(job.file);
            if (!isActiveRef.current) break;
            workingFiles[index] = resized;
          } catch (error) {
            if (!isActiveRef.current) break;
            toast.error(`Could not resize ${job.file.name}`, {
              description: error instanceof Error ? error.message : 'Try a smaller source file.',
            });
          }
        }
      } finally {
        setResizingJobId(null);
        setIsResizingAll(false);
        if (isActiveRef.current) onFilesChange?.(workingFiles);
      }
    }, [files, isResizingAll, onFilesChange, resizableJobs]);

    const liveMessage = progress
      ? `Upload in progress. ${progress.successCount} of ${files.length} files uploaded.${progress.failedCount > 0 ? ` ${progress.failedCount} failed.` : ''}`
      : result
        ? `${result.successful_uploads} of ${result.total_files} files uploaded. ${result.failed_uploads} failed.`
        : `${validUploadCount} of ${files.length} files ready to upload.`;

    if (!isOpen) return null;

    return (
      <>
        <PasteHandler onPaste={handlePaste} disabled={intakeDisabled} />
        <AppDialog
          open={isOpen}
          onClose={handleClose}
          size="5xl"
          initialFocusRef={uploadButtonRef as React.RefObject<HTMLElement | null>}
          panelProps={{
            'data-upload-dropzone': 'review-queue',
            onDragEnter: handleDragOver,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
          }}
          containerClassName="fixed inset-0 flex w-screen items-start justify-center overflow-y-auto p-3 sm:p-6"
          backdropClassName="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
          panelClassName="relative my-4 flex min-h-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl sm:my-8 sm:max-h-[calc(100dvh-4rem)] dark:bg-surface-foreground"
        >
        <div className="shrink-0 border-b border-border/45 bg-surface px-5 py-5 sm:px-7 dark:bg-surface-foreground">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-accent">
                  {result ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : isUploading ? (
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Images className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {result ? 'Transfer summary' : isUploading ? 'Uploading' : 'Upload queue'}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
                  {files.length} file{files.length === 1 ? '' : 's'} · {formatFileSize(totalSize)}
                </span>
              </div>
              <AppDialogTitle className="font-oswald text-2xl font-bold uppercase text-text sm:text-3xl">
                {result
                  ? 'Upload finished'
                  : isUploading
                    ? 'Keep this window open'
                    : 'Review files'}
              </AppDialogTitle>
              <AppDialogDescription className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted">
                {result
                  ? 'Successful files are being processed. Retry only the files that need attention.'
                  : isUploading
                    ? 'Progress updates below are live for every file in the queue.'
                    : 'Drop more files here, or use the grips to set the upload order.'}
              </AppDialogDescription>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-1 text-muted transition-colors hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
              aria-label="Close upload dialog"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {progress && (
            <div className="mt-4 border-t border-border/40 pt-4">
              <UploadProgressContent progress={progress} totalCount={files.length} />
            </div>
          )}
        </div>

        {showCancelWarning && (
          <UploadCancelWarning
            isUploading={isUploading}
            onConfirmClose={handleForceClose}
            onCancelClose={() => setShowCancelWarning(false)}
          />
        )}

        <div
          data-lenis-prevent
          data-testid="upload-scroll-region"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6"
        >
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {liveMessage}
          </div>

          {result && !isUploading && (
            <div className="mb-5">
              <UploadResultContent result={result} />
            </div>
          )}

          {!result && resizableJobs.length > 0 && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-warning/10 p-4 sm:flex-row sm:items-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-text">
                {validUploadCount === 0
                  ? 'All selected files exceed the maximum size. Resize the images below or remove them.'
                  : `${resizableJobs.length} oversized image${resizableJobs.length === 1 ? '' : 's'} can be compressed to ≤ ${MAX_UPLOAD_FILE_SIZE_MB} MB before upload.`}
              </p>
              <button
                type="button"
                onClick={() => void handleResizeAll()}
                disabled={isResizingAll || isUploading}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-warning/15 px-4 text-xs font-bold text-amber-800 transition-colors hover:bg-warning/25 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-warning dark:text-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Resize all oversized images"
              >
                {isResizingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Shrink className="h-4 w-4" aria-hidden="true" />
                )}
                Resize all
              </button>
            </div>
          )}

          <UploadQueueList
            jobs={jobs}
            reorderDisabled={isUploading || Boolean(result)}
            actionsDisabled={isUploading || Boolean(result)}
            retryDisabled={isUploading}
            resizingJobId={resizingJobId}
            onReorder={handleReorderJobs}
            onRetry={(jobId) => void handleRetryFile(jobId)}
            onRemove={handleRemoveJob}
            onResize={(jobId) => void handleResize(jobId)}
          />
        </div>

        {isDragOver && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-surface/95 px-6 text-center text-accent dark:bg-surface-foreground/95"
          >
            <Upload className="mb-3 h-8 w-8" aria-hidden="true" />
            <p className="text-base font-bold">Drop to add files</p>
            <p className="mt-1 max-w-md text-sm font-medium text-muted">
              They will join the current queue without changing its order.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border/45 bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 dark:bg-surface-foreground">
          <p className="text-sm font-semibold text-muted">
            {result
              ? result.failed_uploads > 0
                ? 'Retry failed files from their row, then finish.'
                : 'All files transferred successfully.'
              : hasValidFiles
                ? `${validUploadCount} ready to upload`
                : 'Fix or remove files with errors to continue.'}
          </p>
          <div className="flex items-center justify-end gap-2">
            {!result && (
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-bold text-muted transition-colors hover:bg-surface-1 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:opacity-45 dark:hover:bg-surface-dark-1"
              >
                Cancel
              </button>
            )}
            {result ? (
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="inline-flex h-11 items-center rounded-xl bg-accent px-6 text-sm font-bold text-white transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-45"
              >
                Done
              </button>
            ) : (
              <button
                ref={uploadButtonRef}
                type="button"
                onClick={() => void handleUpload()}
                disabled={!hasValidFiles || isUploading || isResizingAll}
                className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-xl bg-text px-6 text-sm font-bold text-surface transition-colors hover:bg-text/90 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {isUploading ? 'Uploading' : 'Upload'}
              </button>
            )}
          </div>
        </div>
        </AppDialog>
      </>
    );
  },
);

UploadConfirmModal.displayName = 'UploadConfirmModal';
