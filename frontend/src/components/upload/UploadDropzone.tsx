import type { ReactNode } from 'react';
import {
  useDropzone,
  type FileRejection,
  type DropEvent,
  type DropzoneState,
} from 'react-dropzone';
import { ACCEPTED_MIME_TYPES, MAX_DROPZONE_FILE_SIZE } from './uploadUtils';

export interface UploadDropzoneRenderState {
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  isDragGlobal: boolean;
  isProcessing: boolean;
  open: () => void;
}

interface UploadDropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
  onDragEnter?: (event: DropEvent) => void;
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
  noClick?: boolean;
  noKeyboard?: boolean;
  rootAriaLabel?: string;
  className?: string;
  children: (state: UploadDropzoneRenderState) => ReactNode;
}

export const UploadDropzone = ({
  onFilesAccepted,
  onFilesRejected,
  onDragEnter,
  maxFiles = 0,
  maxSize = MAX_DROPZONE_FILE_SIZE,
  disabled = false,
  noClick = true,
  noKeyboard = true,
  rootAriaLabel,
  className,
  children,
}: UploadDropzoneProps) => {
  const dropzone: DropzoneState = useDropzone({
    onDrop: (acceptedFiles, rejections) => {
      if (acceptedFiles.length > 0) onFilesAccepted(acceptedFiles);
      if (rejections.length > 0) onFilesRejected?.(rejections);
    },
    onDragEnter,
    accept: ACCEPTED_MIME_TYPES,
    maxFiles,
    maxSize,
    disabled,
    noClick,
    noKeyboard,
    multiple: true,
  });

  return (
    <div
      {...dropzone.getRootProps({
        className,
        ...(rootAriaLabel ? { 'aria-label': rootAriaLabel } : {}),
        ...(!noClick || !noKeyboard ? { role: 'button' } : {}),
      })}
    >
      <input
        {...dropzone.getInputProps({
          'aria-label': 'Choose photos or videos to upload',
        })}
      />
      {children({
        isDragActive: dropzone.isDragActive,
        isDragAccept: dropzone.isDragAccept,
        isDragReject: dropzone.isDragReject,
        isDragGlobal: dropzone.isDragGlobal,
        isProcessing: dropzone.isProcessing,
        open: dropzone.open,
      })}
    </div>
  );
};
