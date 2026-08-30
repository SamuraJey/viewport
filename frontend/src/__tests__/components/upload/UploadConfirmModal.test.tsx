import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadConfirmModal } from '../../../components/upload/UploadConfirmModal';
import { usePhotoUpload } from '../../../hooks/usePhotoUpload';
import { resizeImageForUpload } from '../../../lib/imageResize';
import { extractFilesFromEvent, DirectoryReadError } from '../../../components/upload/uploadUtils';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../../../constants/upload';

vi.mock('../../../hooks/usePhotoUpload', () => ({
  usePhotoUpload: vi.fn(),
}));

vi.mock('../../../lib/imageResize', () => ({
  resizeImageForUpload: vi.fn(),
}));

vi.mock('../../../components/upload/uploadUtils', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../components/upload/uploadUtils')
  >();
  return {
    ...actual,
    extractFilesFromEvent: vi.fn(),
  };
});

const idleUpload = (overrides: Record<string, unknown> = {}) => ({
  isUploading: false,
  progress: null,
  result: null,
  setResult: vi.fn(),
  jobs: [],
  totalSize: 0,
  hasLargeFiles: false,
  validUploadCount: 1,
  hasValidFiles: true,
  hasInvalidTypes: false,
  renameWarnings: [],
  handleRemoveFile: vi.fn(),
  handleRemoveJob: vi.fn(),
  handleReorderJobs: vi.fn(),
  handleReplaceFile: vi.fn(),
  handleReplaceJob: vi.fn(),
  handleUpload: vi.fn(),
  handleRetryFile: vi.fn(),
  handleRetryFailed: vi.fn(),
  cancelUpload: vi.fn().mockResolvedValue(null),
  failedFilesRef: { current: [] },
  ...overrides,
});

describe('UploadConfirmModal', () => {
  beforeEach(() => {
    vi.mocked(usePhotoUpload).mockReturnValue({
      isUploading: true,
      progress: {
        loaded: 350,
        total: 1000,
        percentage: 35,
        currentFile: 'photo-4.jpg',
        successCount: 1,
        failedCount: 0,
        files: {
          'photo-1.jpg': { percentage: 100, status: 'success' },
          'photo-2.jpg': { percentage: 30, status: 'uploading' },
          'photo-3.jpg': { percentage: 25, status: 'uploading' },
          'photo-4.jpg': { percentage: 20, status: 'uploading' },
          'photo-5.jpg': { percentage: 10, status: 'uploading' },
        },
      },
      result: null,
      setResult: vi.fn(),
      jobs: [],
      totalSize: 1000,
      hasLargeFiles: false,
      validUploadCount: 5,
      hasValidFiles: true,
      hasInvalidTypes: false,
      renameWarnings: [],
      handleRemoveFile: vi.fn(),
      handleRemoveJob: vi.fn(),
      handleReorderJobs: vi.fn(),
      handleReplaceFile: vi.fn(),
      handleReplaceJob: vi.fn(),
      handleUpload: vi.fn(),
      handleRetryFile: vi.fn(),
      handleRetryFailed: vi.fn(),
      cancelUpload: vi.fn().mockResolvedValue(null),
      failedFilesRef: { current: [] },
    });
  });

  it('keeps the aggregate progress above the scrollable queue', () => {
    const files = Array.from(
      { length: 5 },
      (_, index) => new File(['image'], `photo-${index + 1}.jpg`, { type: 'image/jpeg' }),
    );

    render(
      <UploadConfirmModal
        isOpen
        onClose={vi.fn()}
        files={files}
        galleryId="gallery-1"
        onUploadComplete={vi.fn()}
      />,
    );

    const overallStatus = screen.getByTestId('upload-overall-status');
    const scrollRegion = screen.getByTestId('upload-scroll-region');

    expect(scrollRegion).not.toContainElement(overallStatus);
    expect(screen.getByText('photo-4.jpg')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Overall upload progress' })).toHaveAttribute(
      'aria-valuenow',
      '35',
    );
  });

  it('can resize after a mounted modal closes and reopens', async () => {
    const user = userEvent.setup();
    const largeFile = new File(['image'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(largeFile, 'size', {
      value: MAX_UPLOAD_FILE_SIZE_BYTES + 1,
    });
    const resizedFile = new File(['resized'], 'large.jpg', { type: 'image/jpeg' });
    const handleReplaceJob = vi.fn();
    vi.mocked(resizeImageForUpload).mockResolvedValue(resizedFile);
    vi.mocked(usePhotoUpload).mockReturnValue({
      isUploading: false,
      progress: null,
      result: null,
      setResult: vi.fn(),
      jobs: [
        {
          id: 'job-1',
          file: largeFile,
          filename: largeFile.name,
          status: 'failed',
          progress: 0,
        },
      ],
      totalSize: largeFile.size,
      hasLargeFiles: true,
      validUploadCount: 0,
      hasValidFiles: false,
      hasInvalidTypes: false,
      renameWarnings: [],
      handleRemoveFile: vi.fn(),
      handleRemoveJob: vi.fn(),
      handleReorderJobs: vi.fn(),
      handleReplaceFile: vi.fn(),
      handleReplaceJob,
      handleUpload: vi.fn(),
      handleRetryFile: vi.fn(),
      handleRetryFailed: vi.fn(),
      cancelUpload: vi.fn().mockResolvedValue(null),
      failedFilesRef: { current: [] },
    });
    const props = {
      onClose: vi.fn(),
      files: [largeFile],
      galleryId: 'gallery-1',
      onUploadComplete: vi.fn(),
    };

    const { rerender } = render(<UploadConfirmModal {...props} isOpen />);

    await user.click(screen.getByLabelText('Close upload dialog'));
    await user.click(screen.getByRole('button', { name: 'Yes, Close' }));
    rerender(<UploadConfirmModal {...props} isOpen={false} />);
    rerender(<UploadConfirmModal {...props} isOpen />);

    await user.click(screen.getByLabelText('Resize large.jpg to fit size limit'));

    await waitFor(() => {
      expect(handleReplaceJob).toHaveBeenCalledWith('job-1', resizedFile);
    });
  });

  describe('directory drop into the review queue', () => {
    const makeDropEvent = (files: File[]) => ({
      dataTransfer: {
        files,
        items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      },
    });

    it('appends a dropped directory to the existing queue without reordering it', async () => {
      const existing = new File(['existing'], 'existing.jpg', { type: 'image/jpeg' });
      const nested = new File(['nested'], 'nested.jpg', { type: 'image/jpeg' });
      const onFilesAdded = vi.fn();
      vi.mocked(extractFilesFromEvent).mockResolvedValue({ files: [nested], hadDirectory: true });
      vi.mocked(usePhotoUpload).mockReturnValue(idleUpload());

      render(
        <UploadConfirmModal
          isOpen
          onClose={vi.fn()}
          files={[existing]}
          galleryId="gallery-1"
          onUploadComplete={vi.fn()}
          onFilesAdded={onFilesAdded}
        />,
      );

      const panel = document.querySelector('[data-upload-dropzone="review-queue"]');
      expect(panel).not.toBeNull();

      fireEvent.drop(panel!, makeDropEvent([nested]));

      await waitFor(() => {
        expect(onFilesAdded).toHaveBeenCalledTimes(1);
        expect(onFilesAdded).toHaveBeenCalledWith([nested]);
      });
    });

    it('shows a scanning state while the directory is being read', async () => {
      let resolveExtraction!: (value: { files: File[]; hadDirectory: boolean }) => void;
      vi.mocked(extractFilesFromEvent).mockReturnValue(
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
      );
      vi.mocked(usePhotoUpload).mockReturnValue(idleUpload());

      render(
        <UploadConfirmModal
          isOpen
          onClose={vi.fn()}
          files={[new File(['a'], 'a.jpg', { type: 'image/jpeg' })]}
          galleryId="gallery-1"
          onUploadComplete={vi.fn()}
          onFilesAdded={vi.fn()}
        />,
      );

      const nested = new File(['nested'], 'nested.jpg', { type: 'image/jpeg' });
      fireEvent.drop(
        document.querySelector('[data-upload-dropzone="review-queue"]')!,
        makeDropEvent([nested]),
      );

      // Scanning feedback is visible while extraction is pending.
      expect(screen.getByText('Scanning folder')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Scanning folder')).toBeInTheDocument();
      });

      resolveExtraction({ files: [nested], hadDirectory: true });
      await waitFor(() => {
        expect(screen.queryByText('Scanning folder')).not.toBeInTheDocument();
      });
    });

    it('blocks intake while a directory is being scanned', async () => {
      let resolveExtraction!: (value: { files: File[]; hadDirectory: boolean }) => void;
      vi.mocked(extractFilesFromEvent).mockReturnValue(
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
      );
      const onFilesAdded = vi.fn();
      vi.mocked(usePhotoUpload).mockReturnValue(idleUpload());

      render(
        <UploadConfirmModal
          isOpen
          onClose={vi.fn()}
          files={[new File(['a'], 'a.jpg', { type: 'image/jpeg' })]}
          galleryId="gallery-1"
          onUploadComplete={vi.fn()}
          onFilesAdded={onFilesAdded}
        />,
      );

      const panel = document.querySelector('[data-upload-dropzone="review-queue"]')!;
      const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
      fireEvent.drop(panel, makeDropEvent([first]));

      // Let React commit isScanningDrop=true so the next drop sees intake disabled.
      await waitFor(() => {
        expect(screen.getByText('Scanning folder')).toBeInTheDocument();
      });

      // A second drop during the scan must be ignored.
      const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });
      fireEvent.drop(panel, makeDropEvent([second]));

      resolveExtraction({ files: [first], hadDirectory: true });
      await waitFor(() => {
        expect(onFilesAdded).toHaveBeenCalledTimes(1);
      });
      // Only the first drop is staged; the second is dropped on the floor.
      expect(onFilesAdded).toHaveBeenCalledTimes(1);
    });

    it('ignores a late extraction result after the modal closes', async () => {
      let resolveExtraction!: (value: { files: File[]; hadDirectory: boolean }) => void;
      vi.mocked(extractFilesFromEvent).mockReturnValue(
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
      );
      const onFilesAdded = vi.fn();
      const onClose = vi.fn();
      vi.mocked(usePhotoUpload).mockReturnValue(idleUpload());

      render(
        <UploadConfirmModal
          isOpen
          onClose={onClose}
          files={[]}
          galleryId="gallery-1"
          onUploadComplete={vi.fn()}
          onFilesAdded={onFilesAdded}
        />,
      );

      const dropped = new File(['late'], 'late.jpg', { type: 'image/jpeg' });
      fireEvent.drop(
        document.querySelector('[data-upload-dropzone="review-queue"]')!,
        makeDropEvent([dropped]),
      );

      // Ensure the scan is pending before closing.
      await waitFor(() => {
        expect(screen.getByText('Scanning folder')).toBeInTheDocument();
      });

      // Close the modal while extraction is still pending.
      fireEvent.click(screen.getByLabelText('Close upload dialog'));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });

      resolveExtraction({ files: [dropped], hadDirectory: true });
      await waitFor(() => {
        // The late result must not re-add files to a closed queue.
        expect(onFilesAdded).not.toHaveBeenCalled();
      });
    });

    it('clears the scanning state and recovers after a DirectoryReadError', async () => {
      const onFilesAdded = vi.fn();
      vi.mocked(usePhotoUpload).mockReturnValue(idleUpload());

      render(
        <UploadConfirmModal
          isOpen
          onClose={vi.fn()}
          files={[new File(['a'], 'a.jpg', { type: 'image/jpeg' })]}
          galleryId="gallery-1"
          onUploadComplete={vi.fn()}
          onFilesAdded={onFilesAdded}
        />,
      );

      const panel = document.querySelector('[data-upload-dropzone="review-queue"]')!;

      // First drop: extraction rejects with a controlled DirectoryReadError.
      vi.mocked(extractFilesFromEvent).mockRejectedValue(new DirectoryReadError());
      const failed = new File(['failed'], 'failed.jpg', { type: 'image/jpeg' });
      fireEvent.drop(panel, makeDropEvent([failed]));

      // The scanning state appears while extraction is in flight…
      await waitFor(() => {
        expect(screen.getByText('Scanning folder')).toBeInTheDocument();
      });
      // …and is cleared once the rejection is handled.
      await waitFor(() => {
        expect(screen.queryByText('Scanning folder')).not.toBeInTheDocument();
      });
      // The failed drop must not stage any files.
      expect(onFilesAdded).not.toHaveBeenCalled();

      // A subsequent drop after the error still works.
      vi.mocked(extractFilesFromEvent).mockResolvedValue({
        files: [new File(['ok'], 'ok.jpg', { type: 'image/jpeg' })],
        hadDirectory: true,
      });
      const ok = new File(['ok'], 'ok.jpg', { type: 'image/jpeg' });
      fireEvent.drop(panel, makeDropEvent([ok]));

      await waitFor(() => {
        expect(onFilesAdded).toHaveBeenCalledTimes(1);
      });
    });
  });
});
