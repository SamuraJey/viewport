import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadConfirmModal } from '../../../components/upload/UploadConfirmModal';
import { usePhotoUpload } from '../../../hooks/usePhotoUpload';
import { resizeImageForUpload } from '../../../lib/imageResize';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../../../constants/upload';

vi.mock('../../../hooks/usePhotoUpload', () => ({
  usePhotoUpload: vi.fn(),
}));

vi.mock('../../../lib/imageResize', () => ({
  resizeImageForUpload: vi.fn(),
}));

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
});
