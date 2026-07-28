import { createPortal } from 'react-dom';
import { AlertTriangle, UploadCloud } from 'lucide-react';
import { MAX_VIDEO_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';

interface UploadDragOverlayProps {
  visible: boolean;
  fileCount?: number;
  isRejected?: boolean;
}

export const UploadDragOverlay = ({
  visible,
  fileCount = 0,
  isRejected = false,
}: UploadDragOverlayProps) => {
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-photo-overlay p-4 backdrop-blur-md"
      aria-hidden="true"
      data-testid="upload-drag-overlay"
    >
      <div
        className={`w-full max-w-xl rounded-3xl border-2 border-dashed bg-surface/96 px-8 py-12 text-center shadow-2xl sm:px-12 ${
          isRejected ? 'border-danger' : 'border-accent'
        }`}
      >
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-2xl ${
            isRejected ? 'bg-danger/12 text-danger' : 'bg-accent/12 text-accent'
          }`}
        >
          {isRejected ? (
            <AlertTriangle className="h-10 w-10" />
          ) : (
            <UploadCloud className="h-10 w-10" />
          )}
        </div>
        <p className="mt-6 font-oswald text-3xl font-bold uppercase text-text">
          {isRejected ? 'Some files cannot be added' : 'Drop files to add them'}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-6 text-muted">
          {isRejected
            ? `Use JPG, PNG, or a supported video format. Videos can be up to ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`
            : 'Release anywhere to stage photos and videos in the upload queue.'}
        </p>
        {fileCount > 0 && (
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-accent">
            {fileCount} file{fileCount === 1 ? '' : 's'} detected
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
};
