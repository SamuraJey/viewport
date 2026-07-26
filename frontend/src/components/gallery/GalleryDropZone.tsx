import { useCallback, useState, type ReactNode } from 'react';
import type { DropEvent } from 'react-dropzone';
import { toast } from 'sonner';
import { PasteHandler } from '../upload/PasteHandler';
import { UploadDragOverlay } from '../upload/UploadDragOverlay';
import { UploadDropzone } from '../upload/UploadDropzone';
import { describeUploadRejections } from '../upload/uploadUtils';

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

  const handleDragEnter = useCallback((event: DropEvent) => {
    if ('dataTransfer' in event) {
      setDraggedFileCount(
        Array.from(event.dataTransfer?.items ?? []).filter((item) => item.kind === 'file').length,
      );
    }
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
      onFilesAccepted={onFilesAccepted}
      onFilesRejected={(rejections) =>
        toast.error('Some files were not added', {
          description: describeUploadRejections(rejections),
        })
      }
      onDragEnter={handleDragEnter}
      disabled={disabled}
      className="contents"
    >
      {({ isDragGlobal, isDragReject }) => (
        <>
          <PasteHandler onPaste={handlePaste} disabled={disabled} />
          <UploadDragOverlay
            visible={isDragGlobal}
            fileCount={draggedFileCount}
            isRejected={isDragReject}
          />
          {children}
        </>
      )}
    </UploadDropzone>
  );
};
