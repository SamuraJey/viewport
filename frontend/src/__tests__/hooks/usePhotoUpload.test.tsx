import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoUpload } from '../../hooks/usePhotoUpload';
import { photoService } from '../../services/photoService';
import type { PhotoUploadProgress, PhotoUploadResponse } from '../../types';

vi.mock('../../services/photoService', () => ({
  photoService: {
    uploadPhotosPresigned: vi.fn(),
    retryFailedUploads: vi.fn(),
  },
}));

const makeFile = (name: string) =>
  new File(['image-data'], name, {
    type: 'image/jpeg',
    lastModified: name.length,
  });

describe('usePhotoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks inline progress and retries only the failed file', async () => {
    const first = makeFile('first.jpg');
    const second = makeFile('second.jpg');
    const initialResult: PhotoUploadResponse = {
      results: [
        { filename: 'first.jpg', original_filename: 'first.jpg', success: true },
        {
          filename: 'second.jpg',
          original_filename: 'second.jpg',
          success: false,
          error: 'Network interrupted',
        },
      ],
      total_files: 2,
      successful_uploads: 1,
      failed_uploads: 1,
    };

    vi.mocked(photoService.uploadPhotosPresigned).mockImplementation(
      async (_galleryId, _files, onProgress) => {
        const progress: PhotoUploadProgress = {
          loaded: first.size + Math.round(second.size / 2),
          total: first.size + second.size,
          percentage: 75,
          currentFile: 'second.jpg',
          successCount: 1,
          failedCount: 0,
          files: {
            'first.jpg': { percentage: 100, status: 'success' },
            'second.jpg': { percentage: 50, status: 'uploading' },
          },
        };
        onProgress?.(progress);
        return initialResult;
      },
    );
    vi.mocked(photoService.retryFailedUploads).mockResolvedValue({
      results: [{ filename: 'second.jpg', original_filename: 'second.jpg', success: true }],
      total_files: 1,
      successful_uploads: 1,
      failed_uploads: 0,
    });

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [first, second], [], vi.fn()));

    await act(async () => {
      await result.current.handleUpload();
    });

    expect(result.current.jobs.map((job) => job.status)).toEqual(['success', 'failed']);
    const failedJob = result.current.jobs[1];

    await act(async () => {
      await result.current.handleRetryFile(failedJob.id);
    });

    expect(photoService.retryFailedUploads).toHaveBeenCalledTimes(1);
    expect(vi.mocked(photoService.retryFailedUploads).mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ filename: 'second.jpg', file: second }),
    ]);
    await waitFor(() => {
      expect(result.current.jobs.map((job) => job.status)).toEqual(['success', 'success']);
      expect(result.current.result).toMatchObject({
        successful_uploads: 2,
        failed_uploads: 0,
      });
    });
  });

  it('ignores late upload completion after cancellation', async () => {
    const file = makeFile('pending.jpg');
    const completedResult: PhotoUploadResponse = {
      results: [{ filename: file.name, original_filename: file.name, success: true }],
      total_files: 1,
      successful_uploads: 1,
      failed_uploads: 0,
    };
    let resolveUpload!: (value: PhotoUploadResponse) => void;
    const pendingUpload = new Promise<PhotoUploadResponse>((resolve) => {
      resolveUpload = resolve;
    });

    vi.mocked(photoService.uploadPhotosPresigned).mockImplementation(
      async (_galleryId, _files, onProgress) => {
        onProgress?.({
          loaded: Math.round(file.size / 2),
          total: file.size,
          percentage: 50,
          currentFile: file.name,
          successCount: 0,
          failedCount: 0,
          files: {
            [file.name]: { percentage: 50, status: 'uploading' },
          },
        });
        return pendingUpload;
      },
    );

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [file], [], vi.fn()));

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.handleUpload();
    });

    await waitFor(() => {
      expect(result.current.progress?.percentage).toBe(50);
      expect(result.current.jobs[0]?.status).toBe('uploading');
    });

    let cancelPromise!: Promise<PhotoUploadResponse | null>;
    act(() => {
      cancelPromise = result.current.cancelUpload();
    });

    let partialResult: PhotoUploadResponse | null = null;
    await act(async () => {
      resolveUpload(completedResult);
      [partialResult] = await Promise.all([cancelPromise, uploadPromise]);
    });

    expect(partialResult).toEqual(completedResult);
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.jobs.every((job) => job.status !== 'uploading')).toBe(true);
  });

  it('restores a retryable failure when a retry is cancelled', async () => {
    const file = makeFile('retry.jpg');
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue({
      results: [
        {
          filename: file.name,
          original_filename: file.name,
          success: false,
          error: 'Network interrupted',
          retryable: true,
        },
      ],
      total_files: 1,
      successful_uploads: 0,
      failed_uploads: 1,
    });

    let resolveRetry!: (value: PhotoUploadResponse) => void;
    vi.mocked(photoService.retryFailedUploads).mockImplementation(
      () =>
        new Promise<PhotoUploadResponse>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [file], [], vi.fn()));

    await act(async () => {
      await result.current.handleUpload();
    });
    expect(result.current.jobs[0]).toMatchObject({
      status: 'failed',
      error: 'Network interrupted',
      retryable: true,
    });

    let retryPromise!: Promise<void>;
    act(() => {
      retryPromise = result.current.handleRetryFile(result.current.jobs[0].id);
    });
    await waitFor(() => expect(result.current.jobs[0]?.status).toBe('uploading'));

    act(() => {
      result.current.cancelUpload();
    });
    await act(async () => {
      resolveRetry({
        results: [{ filename: file.name, original_filename: file.name, success: true }],
        total_files: 1,
        successful_uploads: 1,
        failed_uploads: 0,
      });
      await retryPromise;
    });

    expect(result.current.jobs[0]).toMatchObject({
      status: 'failed',
      progress: 0,
      error: 'Network interrupted',
      retryable: true,
    });
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('returns the original successful results when a failed-file retry is cancelled', async () => {
    const successfulFile = makeFile('complete.jpg');
    const failedFile = makeFile('retry.jpg');
    const initialResult: PhotoUploadResponse = {
      results: [
        {
          filename: successfulFile.name,
          original_filename: successfulFile.name,
          success: true,
        },
        {
          filename: failedFile.name,
          original_filename: failedFile.name,
          success: false,
          error: 'Network interrupted',
          retryable: true,
        },
      ],
      total_files: 2,
      successful_uploads: 1,
      failed_uploads: 1,
    };
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue(initialResult);

    let resolveRetry!: (value: PhotoUploadResponse) => void;
    vi.mocked(photoService.retryFailedUploads).mockImplementation(
      () =>
        new Promise<PhotoUploadResponse>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    const { result } = renderHook(() =>
      usePhotoUpload('gallery-1', [successfulFile, failedFile], [], vi.fn()),
    );

    await act(async () => {
      await result.current.handleUpload();
    });

    let retryPromise!: Promise<void>;
    act(() => {
      retryPromise = result.current.handleRetryFile(result.current.jobs[1].id);
    });
    await waitFor(() => expect(result.current.jobs[1]?.status).toBe('uploading'));

    let cancelPromise!: Promise<PhotoUploadResponse | null>;
    act(() => {
      cancelPromise = result.current.cancelUpload();
    });

    let partialResult: PhotoUploadResponse | null = null;
    await act(async () => {
      resolveRetry({
        results: [],
        total_files: 0,
        successful_uploads: 0,
        failed_uploads: 0,
      });
      [partialResult] = await Promise.all([cancelPromise, retryPromise]);
    });

    expect(partialResult).toEqual(initialResult);
    expect(result.current.result).toBeNull();
    expect(result.current.jobs).toEqual([
      expect.objectContaining({ filename: successfulFile.name, status: 'success' }),
      expect.objectContaining({ filename: failedFile.name, status: 'failed' }),
    ]);
  });

  it('prepares deterministic duplicate filenames without dropping distinct files', () => {
    const first = makeFile('photo.jpg');
    const second = new File(['other-image-data'], 'photo.jpg', {
      type: 'image/jpeg',
      lastModified: 99,
    });

    const { result } = renderHook(() =>
      usePhotoUpload('gallery-1', [first, second], ['photo.jpg'], vi.fn()),
    );

    expect(result.current.jobs.map((job) => job.filename)).toEqual([
      'photo (1).jpg',
      'photo (2).jpg',
    ]);
  });

  it('keeps extension-recognized videos uploadable when the browser omits the MIME type', () => {
    const video = new File(['video-data'], 'clip.mov', {
      type: '',
      lastModified: 42,
    });

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [video], [], vi.fn()));

    expect(result.current.hasValidFiles).toBe(true);
    expect(result.current.validUploadCount).toBe(1);
    expect(result.current.hasInvalidTypes).toBe(false);
    expect(result.current.jobs[0]).toMatchObject({
      status: 'queued',
      error: undefined,
    });
  });
});
