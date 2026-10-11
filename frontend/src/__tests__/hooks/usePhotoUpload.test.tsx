import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoUpload } from '../../hooks/usePhotoUpload';
import { photoService } from '../../services/photoService';
import { setUploadSourcePath, getUploadFileKey } from '../../components/upload/uploadUtils';
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

  it('preserves unchanged job objects across full progress snapshots', async () => {
    const files = [makeFile('active.jpg'), makeFile('queued.jpg')];
    let report!: (progress: PhotoUploadProgress) => void;
    let finish!: (response: PhotoUploadResponse) => void;
    vi.mocked(photoService.uploadPhotosPresigned).mockImplementation((_id, _files, onProgress) => {
      report = onProgress!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { result } = renderHook(() => usePhotoUpload('gallery-1', files));
    act(() => {
      void result.current.handleUpload();
    });
    const snapshot = (percentage: number): PhotoUploadProgress => ({
      loaded: percentage,
      total: 100,
      percentage,
      currentFile: 'active.jpg',
      successCount: 0,
      failedCount: 0,
      files: {
        'active.jpg': { status: 'uploading', percentage },
        'queued.jpg': { status: 'queued', percentage: 0 },
      },
    });
    act(() => report(snapshot(10)));
    const [active, queued] = result.current.jobs;
    act(() => report(snapshot(20)));
    expect(result.current.jobs[0]).not.toBe(active);
    expect(result.current.jobs[1]).toBe(queued);
    const updated = result.current.jobs;
    act(() => report(snapshot(20)));
    expect(result.current.jobs).toBe(updated);
    await act(async () =>
      finish({ results: [], total_files: 0, successful_uploads: 0, failed_uploads: 0 }),
    );
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

  it('runs retries independently, limits concurrency, and merges out-of-order results', async () => {
    const files = Array.from({ length: 6 }, (_, index) => makeFile(`retry-${index}.jpg`));
    const response = (names: string[], success: boolean): PhotoUploadResponse => ({
      results: names.map((filename) => ({
        filename,
        original_filename: filename,
        success,
        retryable: true,
      })),
      total_files: names.length,
      successful_uploads: success ? names.length : 0,
      failed_uploads: success ? 0 : names.length,
    });
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue(
      response(
        files.map((file) => file.name),
        false,
      ),
    );
    const finish = new Map<string, (value: PhotoUploadResponse) => void>();
    vi.mocked(photoService.retryFailedUploads).mockImplementation(
      (_gallery, items) => new Promise((resolve) => finish.set(items[0].filename, resolve)),
    );
    const { result } = renderHook(() => usePhotoUpload('gallery-1', files));
    await act(async () => {
      await result.current.handleUpload();
    });
    let first!: Promise<void>;
    act(() => {
      first = result.current.handleRetryFile(result.current.jobs[0].id);
    });
    await waitFor(() => expect(finish.size).toBe(1));
    expect(result.current.isUploading).toBe(true);
    let others!: Promise<void>;
    act(() => {
      // Duplicate clicks and Retry all must not create a second intent for the first job.
      result.current.handleRetryFile(result.current.jobs[0].id);
      others = result.current.handleRetryFailed();
    });
    await waitFor(() => expect(finish.size).toBe(4));
    expect(photoService.retryFailedUploads).toHaveBeenCalledTimes(4);
    expect(result.current.jobs.filter((job) => job.status === 'queued')).toHaveLength(2);
    await act(async () => {
      finish.get(files[1].name)!(response([files[1].name], true));
    });
    await waitFor(() => expect(finish.size).toBe(5));
    expect(result.current.jobs[1].status).toBe('success');
    expect(result.current.jobs[0].status).toBe('uploading');
    expect(result.current.isUploading).toBe(true);
    await act(async () => {
      finish.get(files[0].name)!(response([files[0].name], true));
    });
    await waitFor(() => expect(finish.size).toBe(6));
    await act(async () => {
      files.slice(2).forEach((file) => finish.get(file.name)!(response([file.name], true)));
      await Promise.all([first, others]);
    });
    expect(result.current.jobs.every((job) => job.status === 'success')).toBe(true);
    expect(result.current.result).toMatchObject({
      total_files: 6,
      successful_uploads: 6,
      failed_uploads: 0,
    });
    expect(result.current.isUploading).toBe(false);
  });

  it('cancels all active and queued retries and preserves completed uploads', async () => {
    const files = Array.from({ length: 6 }, (_, index) => makeFile(`cancel-${index}.jpg`));
    const initialResult: PhotoUploadResponse = {
      results: files.map((file) => ({ filename: file.name, success: false, retryable: true })),
      total_files: 6,
      successful_uploads: 0,
      failed_uploads: 6,
    };
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue(initialResult);
    const signals: AbortSignal[] = [];
    let completeFirst!: (value: PhotoUploadResponse) => void;
    vi.mocked(photoService.retryFailedUploads).mockImplementation(
      (_gallery, _items, _progress, signal) => {
        signals.push(signal!);
        return new Promise((resolve) => {
          if (signals.length === 1) completeFirst = resolve;
          signal!.addEventListener('abort', () =>
            resolve({
              results: [],
              total_files: 0,
              successful_uploads: 0,
              failed_uploads: 0,
            }),
          );
        });
      },
    );
    const { result } = renderHook(() => usePhotoUpload('gallery-1', files));
    await act(async () => {
      await result.current.handleUpload();
    });
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.handleRetryFailed();
    });
    await waitFor(() => expect(signals).toHaveLength(4));
    await act(async () => {
      completeFirst({
        results: [{ filename: files[0].name, success: true }],
        total_files: 1,
        successful_uploads: 1,
        failed_uploads: 0,
      });
    });
    await waitFor(() => expect(signals).toHaveLength(5));
    let partial: PhotoUploadResponse | null = null;
    await act(async () => {
      partial = await result.current.cancelUpload();
      await retry;
    });
    expect(signals.slice(1).every((signal) => signal.aborted)).toBe(true);
    expect(photoService.retryFailedUploads).toHaveBeenCalledTimes(5);
    expect(result.current.jobs[0].status).toBe('success');
    expect(partial).toMatchObject({ successful_uploads: 1 });
    expect(
      result.current.jobs.slice(1).every((job) => job.status === 'failed' && job.retryable),
    ).toBe(true);
    expect(result.current.isUploading).toBe(false);
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

  it('does not retry a failed file after it is removed from the queue', async () => {
    const file = makeFile('remove-me.jpg');
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue({
      results: [
        {
          filename: file.name,
          original_filename: file.name,
          success: false,
          retryable: true,
        },
      ],
      total_files: 1,
      successful_uploads: 0,
      failed_uploads: 1,
    });

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [file], [], vi.fn()));
    await act(async () => {
      await result.current.handleUpload();
    });

    act(() => {
      result.current.handleRemoveJob(result.current.jobs[0].id);
    });
    await act(async () => {
      await result.current.handleRetryFailed();
    });

    expect(photoService.retryFailedUploads).not.toHaveBeenCalled();
    expect(result.current.result).toMatchObject({ total_files: 0, failed_uploads: 0 });
  });

  it('does not retry a failed original after it is replaced in the queue', async () => {
    const file = makeFile('replace-me.jpg');
    const replacement = makeFile('replacement.jpg');
    vi.mocked(photoService.uploadPhotosPresigned).mockResolvedValue({
      results: [
        {
          filename: file.name,
          original_filename: file.name,
          success: false,
          retryable: true,
        },
      ],
      total_files: 1,
      successful_uploads: 0,
      failed_uploads: 1,
    });

    const { result } = renderHook(() => usePhotoUpload('gallery-1', [file], [], vi.fn()));
    await act(async () => {
      await result.current.handleUpload();
    });

    act(() => {
      result.current.handleReplaceJob(result.current.jobs[0].id, replacement);
    });
    await act(async () => {
      await result.current.handleRetryFailed();
    });

    expect(photoService.retryFailedUploads).not.toHaveBeenCalled();
    expect(result.current.result).toMatchObject({ total_files: 0, failed_uploads: 0 });
  });

  it('keeps same basename from different source paths as distinct jobs', () => {
    // Both files are identical in name, content, MIME type, and lastModified;
    // only their source paths differ. Without the source path in the key they
    // would deduplicate, so this isolates the source path as the distinguishing
    // factor.
    const first = new File(['image-data'], 'photo.jpg', {
      type: 'image/jpeg',
      lastModified: 123,
    });
    const second = new File(['image-data'], 'photo.jpg', {
      type: 'image/jpeg',
      lastModified: 123,
    });
    setUploadSourcePath(first, 'sub-a/photo.jpg');
    setUploadSourcePath(second, 'sub-b/photo.jpg');

    // Verify keys are distinct.
    expect(getUploadFileKey(first)).not.toBe(getUploadFileKey(second));

    const { result } = renderHook(() =>
      usePhotoUpload('gallery-1', [first, second], ['photo.jpg'], vi.fn()),
    );

    expect(result.current.jobs.map((job) => job.filename)).toEqual([
      'photo (1).jpg',
      'photo (2).jpg',
    ]);
    // Job IDs must differ because source paths differ.
    expect(result.current.jobs[0].id).not.toBe(result.current.jobs[1].id);
  });
});
