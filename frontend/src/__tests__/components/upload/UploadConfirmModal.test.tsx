import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadConfirmModal } from '../../../components/upload/UploadConfirmModal';
import { usePhotoUpload } from '../../../hooks/usePhotoUpload';

vi.mock('../../../hooks/usePhotoUpload', () => ({
  usePhotoUpload: vi.fn(),
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
    expect(screen.getByText('4 files uploading in parallel')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Overall upload progress' })).toHaveAttribute(
      'aria-valuenow',
      '35',
    );
  });
});
