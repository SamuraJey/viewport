import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Upload, ImagePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhotoUploadConfirmModal } from './PhotoUploadConfirmModal';
import {
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_VIDEO_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_TYPES,
  VIDEO_EXTENSIONS,
} from '../constants/upload';
import type { PhotoUploadResponse } from '../types';

interface PhotoUploaderProps {
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  existingFilenames?: string[];
  showDropzone?: boolean;
  onModalStateChange?: (isOpen: boolean) => void;
}

export interface PhotoUploaderHandle {
  openFilePicker: () => void;
  handleExternalFiles: (fileList: FileList | File[]) => void;
}

const ACCEPTED_TYPES = SUPPORTED_UPLOAD_TYPES;
const PRIMARY_VIDEO_FORMATS = VIDEO_EXTENSIONS.slice(0, 2)
  .map((extension) => extension.slice(1).toUpperCase())
  .join(' / ');

export const PhotoUploader = forwardRef<PhotoUploaderHandle, PhotoUploaderProps>(
  (
    {
      galleryId,
      onUploadComplete,
      existingFilenames = [],
      showDropzone = true,
      onModalStateChange,
    },
    ref,
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const isVideo = (file: File): boolean => {
      const name = file.name.toLowerCase();
      return file.type.startsWith('video/') || VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
    };

    const handleFiles = (fileList: FileList | File[]) => {
      const rawFiles = Array.from(fileList);
      const fileArray = rawFiles.filter(
        (f) =>
          ACCEPTED_TYPES.includes(f.type) ||
          VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );
      if (fileArray.length === 0) {
        if (rawFiles.length > 0) {
          setError(
            'Only JPG, PNG and supported video files are allowed. Please select valid files.',
          );
        }
        return;
      }

      const oversizedVideos = fileArray.filter(
        (f) => isVideo(f) && f.size > MAX_VIDEO_UPLOAD_FILE_SIZE_MB * 1024 * 1024,
      );
      const acceptedFiles = fileArray.filter((file) => !oversizedVideos.includes(file));
      if (oversizedVideos.length > 0) {
        setError(`Video files must be under ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`);
      } else {
        setError('');
      }
      if (acceptedFiles.length === 0) {
        return;
      }

      setFiles(acceptedFiles);
      setShowConfirmModal(true);
      onModalStateChange?.(true);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    };

    const handleUploadComplete = (result: PhotoUploadResponse) => {
      // Close modal and clear files
      setShowConfirmModal(false);
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onModalStateChange?.(false);
      // Call parent handler with result
      onUploadComplete(result);
    };

    const handleCloseConfirmModal = () => {
      setShowConfirmModal(false);
      // Clear all files when modal is cancelled
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    const handleFilesChange = (newFiles: File[]) => {
      setFiles(newFiles);
    };

    useImperativeHandle(ref, () => ({
      openFilePicker: () => fileInputRef.current?.click(),
      handleExternalFiles: (fileList: FileList | File[]) => handleFiles(fileList),
    }));

    return (
      <div>
        {/* Hidden file input for programmatic opening */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          aria-label="Choose photos or videos to upload"
          className="hidden"
        />

        {showDropzone && (
          <div
            className={`uploader-zone relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl py-12 px-8 cursor-pointer select-none transition-all duration-300 ${
              dragActive
                ? 'uploader-zone--active border-accent bg-accent/10 dark:bg-accent/10 shadow-inner scale-[1.02]'
                : 'border-border/50 dark:border-border/30 hover:border-accent/60 hover:bg-accent/5 dark:hover:bg-accent/5 bg-surface-1/50 dark:bg-surface-dark-1/50 hover:-translate-y-1'
            } focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Upload photos or videos"
          >
            <motion.div
              animate={dragActive ? { scale: 1.2, rotate: -8 } : { scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="mb-4 p-4 rounded-full bg-surface shadow-sm"
            >
              {files.length > 0 ? (
                <ImagePlus className="w-10 h-10 text-accent" />
              ) : (
                <Upload className="w-10 h-10 text-accent" />
              )}
            </motion.div>
            <p className="text-lg font-bold text-text mb-2">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} ready`
                : dragActive
                  ? 'Drop files here'
                  : 'Drag & drop photos or videos here'}
            </p>
            <p className="text-sm font-medium text-muted">
              {files.length > 0
                ? 'Opening upload confirmation...'
                : `or click to select files · JPG / PNG / ${PRIMARY_VIDEO_FORMATS} · up to ${MAX_UPLOAD_FILE_SIZE_MB} MB (images) / ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB (video)`}
            </p>
          </div>
        )}

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="mt-2 text-danger bg-danger/10 dark:bg-danger/20 px-3 py-2 rounded-lg text-sm"
          >
            {error}
          </div>
        )}

        {/* Upload Confirmation Modal */}
        <AnimatePresence>
          {showConfirmModal && (
            <PhotoUploadConfirmModal
              isOpen={showConfirmModal}
              onClose={handleCloseConfirmModal}
              files={files}
              existingFilenames={existingFilenames}
              galleryId={galleryId}
              onUploadComplete={handleUploadComplete}
              onFilesChange={handleFilesChange}
              onModalStateChange={onModalStateChange}
            />
          )}
        </AnimatePresence>
      </div>
    );
  },
);

PhotoUploader.displayName = 'PhotoUploader';
