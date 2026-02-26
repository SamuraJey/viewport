import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Upload, ImagePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhotoUploadConfirmModal } from './PhotoUploadConfirmModal';
import type { PhotoUploadResponse } from '../services/photoService';

interface PhotoUploaderProps {
  galleryId: string;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  showDropzone?: boolean;
}

export interface PhotoUploaderHandle {
  openFilePicker: () => void;
  handleExternalFiles: (fileList: FileList | File[]) => void;
}

interface FileWithMeta {
  file: File;
  error?: string;
  progress?: number;
}

const MAX_SIZE_MB = 15;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const PhotoUploader = forwardRef<PhotoUploaderHandle, PhotoUploaderProps>(
  ({ galleryId, onUploadComplete, showDropzone = true }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState<FileWithMeta[]>([]);
    const [error, setError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const validateFiles = (fileList: FileList | File[]): FileWithMeta[] => {
      return Array.from(fileList).map((file) => {
        let error = '';
        if (!ACCEPTED_TYPES.includes(file.type)) {
          error = 'Only JPG and PNG files are allowed.';
        } else if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          error = `File size must be ≤ ${MAX_SIZE_MB} MB.`;
        }
        return { file, error };
      });
    };

    const handleFiles = (fileList: FileList | File[]) => {
      const validated = validateFiles(fileList);
      setError('');

      const validFiles = validated.filter((f) => !f.error).map((f) => f.file);
      if (validFiles.length > 0) {
        setFiles(validated);
        setShowConfirmModal(true);
      } else {
        // Show only error files if any
        const errorFiles = validated.filter((f) => f.error);
        setFiles(errorFiles);
        if (errorFiles.length > 0) {
          setError('Some files have errors and cannot be uploaded');
        }
      }
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
      const validated = validateFiles(newFiles);
      setFiles(validated);
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
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
        />

        {showDropzone && (
          <div
            className={`uploader-zone relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl py-12 px-8 cursor-pointer select-none transition-all duration-300 ${dragActive
                ? 'uploader-zone--active border-accent bg-accent/10 dark:bg-accent/10 shadow-inner scale-[1.02]'
                : 'border-border/50 dark:border-border/30 hover:border-accent/60 hover:bg-accent/5 dark:hover:bg-accent/5 bg-surface-1/50 dark:bg-surface-dark-1/50 hover:shadow-lg hover:-translate-y-1'
              } focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            tabIndex={0}
            role="button"
            aria-label="Upload photos"
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
                  ? 'Drop photos here'
                  : 'Drag & drop photos here'}
            </p>
            <p className="text-sm font-medium text-muted">
              {files.length > 0
                ? 'Opening upload confirmation...'
                : 'or click to select files · JPG / PNG · up to 15 MB'}
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
              files={files.filter((f) => !f.error).map((f) => f.file)}
              galleryId={galleryId}
              onUploadComplete={handleUploadComplete}
              onFilesChange={handleFilesChange}
            />
          )}
        </AnimatePresence>
      </div>
    );
  },
);

PhotoUploader.displayName = 'PhotoUploader';
