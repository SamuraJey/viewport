import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { UploadConfirmModal } from './upload/UploadConfirmModal';
import { UploadDropzone } from './upload/UploadDropzone';
import {
  MAX_UPLOAD_FILES,
  isSupportedUploadFile,
  prepareUploadSelection,
} from './upload/uploadUtils';
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
    const hiddenFileInputRef = useRef<HTMLInputElement>(null);
    const dropzoneOpenRef = useRef<(() => void) | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [isUploadBusy, setIsUploadBusy] = useState(false);

    const openModal = useCallback(() => {
      setShowConfirmModal(true);
      onModalStateChange?.(true);
    }, [onModalStateChange]);

    const handleFiles = useCallback(
      (fileList: FileList | File[]) => {
        if (isUploadBusy) {
          toast.warning('Wait for the current transfer to finish', {
            description: 'You can add more files when the active upload is complete.',
          });
          return;
        }
        const rawFiles = Array.from(fileList);
        const supportedFiles = rawFiles.filter(isSupportedUploadFile);
        const oversizedVideos = supportedFiles.filter(
          (file) =>
            (file.type.startsWith('video/') ||
              VIDEO_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) &&
            file.size > MAX_VIDEO_UPLOAD_FILE_SIZE_MB * 1024 * 1024,
        );
        const acceptedFiles = supportedFiles.filter((file) => !oversizedVideos.includes(file));

        if (rawFiles.length > supportedFiles.length) {
          setError('Some files were skipped. Use JPG, PNG, or a supported video format.');
        } else if (oversizedVideos.length > 0) {
          setError(`Video files must be under ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`);
        } else {
          setError('');
        }

        if (acceptedFiles.length === 0) return;

        setFiles((currentFiles) => {
          const selection = prepareUploadSelection(currentFiles, acceptedFiles);
          if (selection.duplicateCount > 0) {
            toast.info(
              `${selection.duplicateCount} duplicate file${selection.duplicateCount === 1 ? '' : 's'} skipped`,
            );
          }
          if (selection.overflowCount > 0) {
            toast.warning(`Only ${MAX_UPLOAD_FILES} files can be queued at once`, {
              description: `${selection.overflowCount} file${selection.overflowCount === 1 ? '' : 's'} not added.`,
            });
          }
          return selection.files;
        });
        openModal();
      },
      [isUploadBusy, openModal],
    );

    const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) handleFiles(event.target.files);
      event.target.value = '';
    };

    const handleUploadComplete = (result: PhotoUploadResponse) => {
      setShowConfirmModal(false);
      setFiles([]);
      setIsUploadBusy(false);
      onModalStateChange?.(false);
      onUploadComplete(result);
    };

    const handleCloseConfirmModal = () => {
      setShowConfirmModal(false);
      setFiles([]);
      setIsUploadBusy(false);
      onModalStateChange?.(false);
    };

    useImperativeHandle(
      ref,
      () => ({
        openFilePicker: () => {
          if (showDropzone && dropzoneOpenRef.current) {
            dropzoneOpenRef.current();
            return;
          }
          hiddenFileInputRef.current?.click();
        },
        handleExternalFiles: handleFiles,
      }),
      [handleFiles, showDropzone],
    );

    return (
      <div>
        {!showDropzone && (
          <input
            type="file"
            ref={hiddenFileInputRef}
            onChange={handleFileInput}
            multiple
            accept={SUPPORTED_UPLOAD_TYPES.join(',')}
            aria-label="Choose photos or videos to upload"
            className="hidden"
          />
        )}

        {showDropzone && (
          <UploadDropzone
            onFilesAccepted={handleFiles}
            onFilesRejected={(rejections) => {
              if (rejections.length === 0) return;
              const hasOversizedVideo = rejections.some(
                ({ file }) =>
                  file.type.startsWith('video/') &&
                  file.size > MAX_VIDEO_UPLOAD_FILE_SIZE_MB * 1024 * 1024,
              );
              const hasInvalidType = rejections.some(({ errors }) =>
                errors.some((error) => error.code === 'file-invalid-type'),
              );
              if (hasOversizedVideo) {
                setError(`Video files must be under ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`);
              } else if (hasInvalidType) {
                setError(
                  'Only JPG, PNG and supported video files are allowed. Please select valid files.',
                );
              } else {
                setError(
                  rejections[0]?.errors[0]?.message ??
                    'Some files could not be added to the upload queue.',
                );
              }
            }}
            noClick={false}
            noKeyboard={false}
            rootAriaLabel="Upload photos or videos"
            className="block"
          >
            {({ isDragActive, isDragReject, open }) => {
              dropzoneOpenRef.current = open;
              return (
                <div
                  className={`uploader-zone relative flex cursor-pointer select-none flex-col items-center justify-center rounded-3xl border-2 border-dashed px-8 py-12 text-center transition-all duration-200 ${
                    isDragReject
                      ? 'border-danger bg-danger/8'
                      : isDragActive
                        ? 'border-accent bg-accent/10 shadow-inner'
                        : 'border-border/50 bg-surface-1/50 hover:border-accent/60 hover:bg-accent/5 dark:border-border/30 dark:bg-surface-dark-1/50'
                  } focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface`}
                  role="presentation"
                >
                  <motion.div
                    animate={isDragActive ? { scale: 1.12, rotate: -6 } : { scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-accent shadow-xs dark:bg-surface-dark-2"
                  >
                    {files.length > 0 ? (
                      <ImagePlus className="h-8 w-8" aria-hidden="true" />
                    ) : (
                      <Upload className="h-8 w-8" aria-hidden="true" />
                    )}
                  </motion.div>
                  <p className="text-lg font-bold text-text">
                    {isDragReject
                      ? 'Some files are not supported'
                      : isDragActive
                        ? 'Drop files here'
                        : 'Drag & drop photos or videos here'}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm font-medium text-muted">
                    or click to select files · JPG / PNG / {PRIMARY_VIDEO_FORMATS} · up to{' '}
                    {MAX_UPLOAD_FILE_SIZE_MB} MB (images) / {MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB
                    (video)
                  </p>
                </div>
              );
            }}
          </UploadDropzone>
        )}

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="mt-2 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger"
          >
            {error}
          </div>
        )}

        <AnimatePresence>
          {showConfirmModal && (
            <UploadConfirmModal
              isOpen={showConfirmModal}
              onClose={handleCloseConfirmModal}
              files={files}
              existingFilenames={existingFilenames}
              galleryId={galleryId}
              onUploadComplete={handleUploadComplete}
              onFilesChange={setFiles}
              onModalStateChange={onModalStateChange}
              onBusyChange={setIsUploadBusy}
            />
          )}
        </AnimatePresence>
      </div>
    );
  },
);

PhotoUploader.displayName = 'PhotoUploader';
