import { memo, useEffect, useRef, useState, useMemo } from 'react';
import { AlertTriangle, ImageOff, X, Upload, Images } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import { formatFileSize } from '../../lib/utils';
import { getFileUploadErrorText, hasFileUploadError } from './uploadConfirmUtils';

interface UploadSelectionContentProps {
  files: File[];
  totalSize: number;
  hasLargeFiles: boolean;
  hasInvalidTypes: boolean;
  renameWarnings: Array<{ original: string; unique: string }>;
  isUploading: boolean;
  onRemoveFile: (fileIndex: number) => void;
  onFilesChange?: (files: File[]) => void;
}

const ThumbSkeleton = () => (
  <div className="w-full h-full animate-pulse bg-surface-1 dark:bg-surface-dark-2">
    <div className="w-full h-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
  </div>
);

interface FileCardProps {
  file: File;
  index: number;
  isUploading: boolean;
  onRemoveFile: (index: number) => void;
  renameWarning?: string;
}

const FileCard = memo(
  ({ file, index, isUploading, onRemoveFile, renameWarning }: FileCardProps) => {
    const hasError = hasFileUploadError(file);
    const fileErrorText = getFileUploadErrorText(file);
    const [shouldLoad, setShouldLoad] = useState(false);
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' },
      );
      if (cardRef.current) observer.observe(cardRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (shouldLoad && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        // Validate that the URL is a safe blob URL
        if (url.startsWith('blob:')) {
          setThumbUrl(url);
        }
        return () => URL.revokeObjectURL(url);
      }
    }, [shouldLoad, file]);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        ref={cardRef}
        className={`relative flex flex-col rounded-2xl border group overflow-hidden ${
          hasError
            ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
            : 'bg-surface dark:bg-surface-dark-1 border-border/40 hover:border-accent/40 hover:shadow-sm'
        }`}
      >
        <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-surface-1 dark:bg-surface-dark-2 border-b border-border/30">
          {(!shouldLoad || (shouldLoad && !thumbUrl && file.type.startsWith('image/'))) && (
            <ThumbSkeleton />
          )}
          {shouldLoad && thumbUrl ? (
            <img
              src={thumbUrl}
              alt={`Preview of ${file.name}`}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                hasError ? 'opacity-40 saturate-50' : ''
              }`}
              decoding="async"
            />
          ) : shouldLoad && !thumbUrl && !file.type.startsWith('image/') ? (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-8 h-8 text-muted/60" />
            </div>
          ) : null}

          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/10 backdrop-blur-[2px]">
              <AlertTriangle className="w-8 h-8 text-red-500 drop-shadow-md" />
            </div>
          )}
        </div>

        <div className="flex-1 p-3 min-w-0 flex flex-col">
          <p className="text-sm font-medium text-text dark:text-white truncate" title={file.name}>
            {file.name}
          </p>
          <span className="text-xs text-muted font-medium mt-0.5">{formatFileSize(file.size)}</span>

          {hasError && fileErrorText && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-semibold flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Won't upload: {fileErrorText}</span>
            </div>
          )}

          {!hasError && renameWarning && (
            <div
              className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 font-medium flex items-start gap-1"
              title={`Will be renamed to ${renameWarning}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="truncate">Rename: {renameWarning}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => onRemoveFile(index)}
          disabled={isUploading}
          aria-label={`Remove ${file.name}`}
          className="absolute top-2 right-2 p-1.5 bg-black/40 text-white hover:bg-red-500 hover:text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden backdrop-blur-md"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    );
  },
);
FileCard.displayName = 'FileCard';

const BATCH_SIZE = 30;

export const UploadSelectionContent = ({
  files,
  totalSize,
  hasLargeFiles,
  hasInvalidTypes,
  renameWarnings,
  isUploading,
  onRemoveFile,
  onFilesChange,
}: UploadSelectionContentProps) => {
  const readyFilesCount = files.filter((file) => !hasFileUploadError(file)).length;
  const hasIssues = hasLargeFiles || hasInvalidTypes || renameWarnings.length > 0;
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the container, not child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFilesChange) {
      const newFiles = Array.from(e.target.files).filter((file) => file.type.startsWith('image/'));
      if (newFiles.length > 0) {
        onFilesChange([...files, ...newFiles]);
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!onFilesChange) return;

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/'),
    );

    // Filter out duplicates based on name and size
    const existingFiles = new Set(files.map((f) => `${f.name}-${f.size}`));
    const newFiles = droppedFiles.filter((file) => !existingFiles.has(`${file.name}-${file.size}`));

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
    }
  };

  useEffect(() => {
    setVisibleCount((prev) => Math.min(Math.max(BATCH_SIZE, prev), files.length));
  }, [files.length]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, files.length));
      }
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [files.length]);

  const visibleFiles = useMemo(() => files.slice(0, visibleCount), [files, visibleCount]);

  // Empty state when no files
  if (files.length === 0) {
    return (
      <div
        className={`space-y-6 transition-all duration-200 ${isDragOver ? 'scale-[1.01]' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <h3 className="text-lg font-bold text-text dark:text-white tracking-tight">
              Add photos
            </h3>
            <p className="text-sm text-muted mt-1 font-medium">
              Select images to upload to this gallery
            </p>
          </div>
        </div>

        <div
          className={`relative flex flex-col items-center justify-center py-16 px-8 rounded-2xl border-2 border-dashed transition-all duration-200 ${
            isDragOver ? 'border-accent bg-accent/5' : 'border-border/40 hover:border-accent/40'
          }`}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-2xl">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-accent" />
                </div>
                <p className="text-lg font-semibold text-text dark:text-white">Drop images here</p>
              </div>
            </div>
          )}
          <div className="w-24 h-24 rounded-full bg-surface-1 dark:bg-surface-dark-1 border-2 border-dashed border-border/50 flex items-center justify-center mb-6">
            <Images className="w-10 h-10 text-muted" />
          </div>
          <h4 className="text-lg font-semibold text-text dark:text-white mb-2">
            No photos selected
          </h4>
          <p className="text-sm text-muted text-center mb-6 max-w-sm">
            Choose photos from your device or drag and drop them here to get started.
          </p>
          <button
            onClick={openFilePicker}
            disabled={isUploading}
            className="inline-flex h-12 items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-6 text-sm font-bold text-accent transition-all duration-200 hover:bg-accent/20 hover:border-accent/50 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-5 w-5" />
            Choose Photos
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/jpg"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <h3 className="text-lg font-bold text-text dark:text-white tracking-tight">
            Review files
          </h3>
          <p className="text-sm text-muted mt-1 font-medium">
            {files.length} selected ({formatFileSize(totalSize)})
          </p>
        </div>
        <div className="flex gap-2">
          {readyFilesCount !== files.length && (
            <span className="px-3 py-1.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200 text-xs rounded-full inline-flex items-center font-semibold tracking-wide">
              {files.length - readyFilesCount} issue(s)
            </span>
          )}
        </div>
      </div>

      {hasIssues && (
        <div className="p-4 bg-yellow-50/70 dark:bg-yellow-500/10 border border-yellow-200/70 dark:border-yellow-500/20 rounded-2xl shadow-xs text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <ul className="text-yellow-800 dark:text-yellow-300 space-y-1.5 list-disc ml-4 font-medium">
                {hasLargeFiles && <li>Files over {MAX_UPLOAD_FILE_SIZE_MB}MB will be rejected</li>}
                {hasInvalidTypes && <li>Only JPG and PNG formats are supported</li>}
                {renameWarnings.length > 0 && (
                  <li>
                    Some duplicates will be renamed (e.g., {renameWarnings[0].original} →{' '}
                    {renameWarnings[0].unique})
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 ${
          isDragOver
            ? 'border-accent bg-accent/5 scale-[1.02]'
            : 'border-border/40 hover:border-accent/40'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-2xl">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-text dark:text-white">Drop images here</p>
              <p className="text-sm text-muted">Add more photos to your upload</p>
            </div>
          </div>
        )}

        <div
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4 ${isDragOver ? 'opacity-50' : ''}`}
        >
          <AnimatePresence>
            {visibleFiles.map((file, index) => {
              const renameWarning = renameWarnings.find((w) => w.original === file.name);
              return (
                <FileCard
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  file={file}
                  index={index}
                  isUploading={isUploading}
                  onRemoveFile={onRemoveFile}
                  renameWarning={renameWarning?.unique}
                />
              );
            })}
          </AnimatePresence>
        </div>

        {visibleCount < files.length && <div ref={loadMoreRef} className="h-4 w-full" />}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/jpg"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
};
