import { useEffect, useRef, type ReactNode } from 'react';
import {
  useDropzone,
  type FileRejection,
  type DropEvent,
  type DropzoneState,
} from 'react-dropzone';
import { ACCEPTED_MIME_TYPES, MAX_DROPZONE_FILE_SIZE, extractFilesFromEvent } from './uploadUtils';

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
  onProcessingChange?: (isProcessing: boolean) => void;
  onError?: (error: Error) => void;
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
  onProcessingChange,
  onError,
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
    getFilesFromEvent: async (event) => {
      if (Array.isArray(event)) {
        return Promise.all(event.map((handle) => handle.getFile()));
      }
      const nativeEvent =
        event instanceof Event ? event : (event as { nativeEvent: Event }).nativeEvent;
      // Only perform the full recursive directory traversal on an actual drop.
      // During dragenter the browser exposes DataTransferItems (MIME type only,
      // no name/size); traversing there would be wasteful and would flip the
      // dropzone into its processing state before the user has dropped anything.
      // GalleryDropZone classifies the payload separately via classifyDropPayload.
      // The input change event has no dataTransfer, so it must fall through to the
      // extractor, which reads event.target.files.
      if (nativeEvent.type === 'dragenter') {
        const dataTransfer = (nativeEvent as DragEvent).dataTransfer;
        return Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file');
      }
      const { files } = await extractFilesFromEvent(nativeEvent);
      return files;
    },
    onError,
    accept: ACCEPTED_MIME_TYPES,
    maxFiles,
    maxSize,
    disabled,
    noClick,
    noKeyboard,
    multiple: true,
  });

  const processingRef = useRef(false);
  useEffect(() => {
    if (processingRef.current === dropzone.isProcessing) return;
    processingRef.current = dropzone.isProcessing;
    onProcessingChange?.(dropzone.isProcessing);
  }, [dropzone.isProcessing, onProcessingChange]);

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
