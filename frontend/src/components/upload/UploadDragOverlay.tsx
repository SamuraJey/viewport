import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, UploadCloud } from 'lucide-react';
import { MAX_VIDEO_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import type { DropPayloadKind } from './uploadUtils';

interface UploadDragOverlayProps {
  visible: boolean;
  fileCount?: number;
  isRejected?: boolean;
  payloadKind?: DropPayloadKind;
  isScanning?: boolean;
}

const describePayload = (fileCount: number, payloadKind: DropPayloadKind): string => {
  if (payloadKind === 'folders') {
    return `${fileCount} folder${fileCount === 1 ? '' : 's'} detected`;
  }
  if (payloadKind === 'mixed') {
    return `${fileCount} items detected`;
  }
  if (payloadKind === 'files') {
    return `${fileCount} file${fileCount === 1 ? '' : 's'} detected`;
  }
  return `${fileCount} item${fileCount === 1 ? '' : 's'} detected`;
};

const scanningTitle = (payloadKind: DropPayloadKind): string =>
  payloadKind === 'folders' ? 'Scanning folder' : 'Preparing files';

const scanningSubtitle = (payloadKind: DropPayloadKind): string =>
  payloadKind === 'folders'
    ? 'Collecting photos and videos from the folder.'
    : 'Collecting photos and videos from the dropped items.';

export const UploadDragOverlay = ({
  visible,
  fileCount = 0,
  isRejected = false,
  payloadKind = 'unknown',
  isScanning = false,
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
          ) : isScanning ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : (
            <UploadCloud className="h-10 w-10" />
          )}
        </div>
        <p className="mt-6 font-oswald text-3xl font-bold uppercase text-text">
          {isRejected
            ? 'Some files cannot be added'
            : isScanning
              ? scanningTitle(payloadKind)
              : 'Drop files to add them'}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-6 text-muted">
          {isRejected
            ? `Use JPG, PNG, or a supported video format. Videos can be up to ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`
            : isScanning
              ? scanningSubtitle(payloadKind)
              : 'Release anywhere to stage photos and videos in the upload queue.'}
        </p>
        {!isScanning && fileCount > 0 && (
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-accent">
            {describePayload(fileCount, payloadKind)}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
};
