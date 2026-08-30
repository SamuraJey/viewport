import { useCallback, useState, type ReactNode } from 'react';
import type { DropEvent } from 'react-dropzone';
import { toast } from 'sonner';
import { PasteHandler } from '../upload/PasteHandler';
import { UploadDragOverlay } from '../upload/UploadDragOverlay';
import { UploadDropzone } from '../upload/UploadDropzone';
import {
  classifyDropPayload,
  describeUploadRejections,
  type DropPayloadKind,
} from '../upload/uploadUtils';

interface GalleryDropZoneProps {
  children: ReactNode;
  onFilesAccepted: (files: File[]) => number | void;
  disabled?: boolean;
}

export const GalleryDropZone = ({
  children,
  onFilesAccepted,
  disabled = false,
}: GalleryDropZoneProps) => {
  const [draggedFileCount, setDraggedFileCount] = useState(0);
  const [payloadKind, setPayloadKind] = useState<DropPayloadKind>('unknown');
  const [isScanning, setIsScanning] = useState(false);

  const handleDragEnter = useCallback((event: DropEvent) => {
    if ('dataTransfer' in event) {
      const items = Array.from(event.dataTransfer?.items ?? []).filter(
        (item) => item.kind === 'file',
      );
      setDraggedFileCount(items.length);
      setPayloadKind(classifyDropPayload(event.dataTransfer ?? null));
    }
  }, []);

  const handleFilesAccepted = useCallback(
    (files: File[]) => {
      setIsScanning(false);
      onFilesAccepted(files);
    },
    [onFilesAccepted],
  );

  const handleDropzoneState = useCallback((isProcessing: boolean) => {
    setIsScanning(isProcessing);
  }, []);

  const handlePaste = useCallback(
    (files: File[]) => {
      const stagedCount = onFilesAccepted(files) ?? 0;
      if (stagedCount === 0) return;
      toast.info(`${stagedCount} file${stagedCount === 1 ? '' : 's'} pasted`, {
        description:
          stagedCount === 1 && files.length === 1
            ? files[0]?.name
            : 'Added to the upload queue from the clipboard.',
      });
    },
    [onFilesAccepted],
  );

  return (
    <UploadDropzone
      onFilesAccepted={handleFilesAccepted}
      onFilesRejected={(rejections) =>
        toast.error('Some files were not added', {
          description: describeUploadRejections(rejections),
        })
      }
      onDragEnter={handleDragEnter}
      onProcessingChange={handleDropzoneState}
      onError={(error) =>
        toast.error('Could not read the dropped folder', {
          description: error.message,
        })
      }
      disabled={disabled || isScanning}
      className="contents"
    >
      {({ isDragGlobal, isDragReject, isProcessing }) => (
        <>
          <PasteHandler onPaste={handlePaste} disabled={disabled} />
          <UploadDragOverlay
            visible={(isDragGlobal || isProcessing) && !disabled}
            fileCount={draggedFileCount}
            isRejected={isDragReject}
            payloadKind={payloadKind}
            isScanning={isProcessing}
          />
          <div role="status" aria-live="polite" className="sr-only">
            {isProcessing
              ? payloadKind === 'folders'
                ? 'Scanning folder for photos and videos.'
                : 'Preparing dropped files.'
              : ''}
          </div>
          {children}
        </>
      )}
    </UploadDropzone>
  );
};
