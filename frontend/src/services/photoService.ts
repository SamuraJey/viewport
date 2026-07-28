import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { ApiError } from '../lib/errorHandling';
import { getDemoService } from './demoService';
import { useAuthStore } from '../stores/authStore';
import type {
  BatchDeletePhotosRequest,
  BatchDeletePhotosResponse,
  PhotoResponse,
  PhotoUploadResult,
  PhotoUploadResponse,
  PhotoUploadProgress,
  UploadPreparedFile,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadResponse,
} from '../types';
import {
  MAX_CONCURRENT_FILE_UPLOADS,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_MB,
  VIDEO_PART_SIZE,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  getUploadContentType,
} from '../constants/upload';

const DOWNLOAD_TARGET_NAME = 'viewport-browser-download';
const DOWNLOAD_TARGET_ID = 'viewport-browser-download-frame';
const MULTIPART_UPLOAD_CONCURRENCY = 4;
const MULTIPART_PART_TIMEOUT_MS = 120_000;
const MULTIPART_COMPLETE_MAX_RETRIES = 3;

const EMPTY_BATCH_DELETE_RESULT: BatchDeletePhotosResponse = {
  requested_count: 0,
  deleted_ids: [],
  not_found_ids: [],
  failed_ids: [],
};

const appendHiddenField = (form: HTMLFormElement, name: string, value: string) => {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
};

const ensureDownloadTarget = (): string => {
  let iframe = document.getElementById(DOWNLOAD_TARGET_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = DOWNLOAD_TARGET_ID;
    iframe.name = DOWNLOAD_TARGET_NAME;
    iframe.hidden = true;
    document.body.appendChild(iframe);
  }

  return iframe.name;
};

const getDownloadAccessToken = (): string => {
  const accessToken = useAuthStore.getState().tokens?.access_token;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  return accessToken;
};

const submitBrowserDownload = (path: string, fields: Record<string, string | string[]>): void => {
  const apiBaseUrl = api.defaults?.baseURL ?? '';
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${apiBaseUrl}${path}`;
  form.target = ensureDownloadTarget();
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => appendHiddenField(form, name, item));
      return;
    }

    appendHiddenField(form, name, value);
  });

  document.body.appendChild(form);
  form.submit();
  window.setTimeout(() => {
    form.remove();
  }, 0);
};

const deletePhotos = async (
  galleryId: string,
  photoIds: string[],
): Promise<BatchDeletePhotosResponse> => {
  if (photoIds.length === 0) {
    return EMPTY_BATCH_DELETE_RESULT;
  }

  if (isDemoModeEnabled()) {
    return getDemoService().deletePhotos(galleryId, photoIds);
  }

  const request: BatchDeletePhotosRequest = {
    photo_ids: photoIds,
  };

  const response = await api.delete<BatchDeletePhotosResponse>(`/galleries/${galleryId}/photos`, {
    data: request,
  });

  return response.data;
};

const deletePhoto = async (galleryId: string, photoId: string): Promise<void> => {
  const result = await deletePhotos(galleryId, [photoId]);

  if (result.not_found_ids.includes(photoId)) {
    throw new ApiError(404, 'Photo not found', { detail: 'Photo not found' });
  }

  if (result.failed_ids.includes(photoId)) {
    throw new Error('Failed to enqueue photo deletion');
  }
};

const renamePhoto = async (
  galleryId: string,
  photoId: string,
  filename: string,
): Promise<PhotoResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().renamePhoto(galleryId, photoId, filename);
  }

  const response = await api.patch<PhotoResponse>(
    `/galleries/${galleryId}/photos/${photoId}/rename`,
    {
      filename,
    },
  );
  return response.data;
};

const downloadGalleryZip = async (galleryId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().downloadGalleryZip(galleryId);
    return;
  }

  submitBrowserDownload(`/galleries/${galleryId}/download/all`, {
    access_token: getDownloadAccessToken(),
  });
};

const downloadSelectedPhotosZip = async (galleryId: string, photoIds: string[]): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().downloadSelectedPhotosZip(galleryId, photoIds);
    return;
  }

  submitBrowserDownload(`/galleries/${galleryId}/download/selected`, {
    access_token: getDownloadAccessToken(),
    photo_ids: photoIds,
  });
};

const downloadPhoto = async (galleryId: string, photoId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().downloadPhoto(galleryId, photoId);
    return;
  }

  submitBrowserDownload(`/galleries/${galleryId}/photos/${photoId}/download`, {
    access_token: getDownloadAccessToken(),
  });
};

// File type detection helpers
const isVideoFile = (file: File): boolean => {
  return SUPPORTED_VIDEO_TYPES.includes(getUploadContentType(file));
};

const isImageFile = (file: File): boolean => {
  return SUPPORTED_IMAGE_TYPES.includes(getUploadContentType(file));
};

const validateUploadFile = (file: File): string | null => {
  if (file.size === 0) return 'Cannot upload empty file';
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES) {
      return `File exceeds maximum size of ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB}MB`;
    }
    return null;
  }
  if (isImageFile(file)) {
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return `File exceeds maximum size of ${MAX_UPLOAD_FILE_SIZE_MB}MB`;
    }
    return null;
  }
  return 'Unsupported file type';
};
// Batch presigned upload methods
const batchCreateUploadIntents = async (
  galleryId: string,
  files: UploadPreparedFile[],
  signal?: AbortSignal,
): Promise<BatchPresignedUploadsResponse> => {
  const request: BatchPresignedUploadsRequest = {
    files: files.map((item) => ({
      filename: item.filename,
      file_size: item.file.size,
      content_type: getUploadContentType(item.file),
    })),
  };

  const response = await api.post<BatchPresignedUploadsResponse>(
    `/galleries/${galleryId}/photos/batch-presigned`,
    request,
    { signal },
  );
  return response.data;
};

const batchConfirmUploads = async (
  galleryId: string,
  photoIds: string[],
  failedIds: string[] = [],
  signal?: AbortSignal,
): Promise<BatchConfirmUploadResponse> => {
  const items: ConfirmPhotoUploadItem[] = [
    ...photoIds.map((id) => ({ photo_id: id, success: true })),
    ...failedIds.map((id) => ({ photo_id: id, success: false })),
  ];

  const response = await api.post<BatchConfirmUploadResponse>(
    `/galleries/${galleryId}/photos/batch-confirm`,
    { items },
    { signal },
  );
  return response.data;
};

// Multipart upload lifecycle calls
const completeMultipartUpload = async (
  galleryId: string,
  photoId: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[],
  signal?: AbortSignal,
): Promise<void> => {
  for (let attempt = 0; attempt < MULTIPART_COMPLETE_MAX_RETRIES; attempt += 1) {
    try {
      await api.post(
        `/galleries/${galleryId}/photos/${photoId}/multipart/complete`,
        { upload_id: uploadId, parts },
        { signal },
      );
      return;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      const isTransient = status === undefined || status >= 500;
      if (signal?.aborted || !isTransient || attempt === MULTIPART_COMPLETE_MAX_RETRIES - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
};

const abortMultipartUpload = async (
  galleryId: string,
  photoId: string,
  uploadId: string,
  signal?: AbortSignal,
): Promise<void> => {
  await api.post(
    `/galleries/${galleryId}/photos/${photoId}/multipart/abort`,
    { upload_id: uploadId },
    { signal },
  );
};
const uploadToS3 = async (
  presignedData: { url: string; headers: Record<string, string> },
  file: File,
  onProgress?: (percentage: number) => void,
  signal?: AbortSignal,
): Promise<void> => {
  // Validate file is not empty before attempting upload
  if (file.size === 0) {
    throw new Error('Cannot upload empty file');
  }

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Upload cancelled');
  }

  const MAX_RETRIES = 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Check abort before each retry
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    try {
      // Direct fetch from S3
      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<void>((resolve, reject) => {
        // Abort handler
        const handleAbort = () => {
          xhr.abort();
          reject(new Error('Upload cancelled'));
        };

        if (signal) {
          signal.addEventListener('abort', handleAbort);
        }

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percentage = (e.loaded / e.total) * 100;
            onProgress(percentage);
          }
        });

        xhr.addEventListener('load', () => {
          if (signal) {
            signal.removeEventListener('abort', handleAbort);
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            const errorMsg = `S3 upload failed (attempt ${attempt}/${MAX_RETRIES}): ${xhr.status} ${xhr.statusText}`;
            reject(new Error(errorMsg));
          }
        });

        xhr.addEventListener('error', () => {
          if (signal) {
            signal.removeEventListener('abort', handleAbort);
          }
          reject(new Error(`S3 upload network error (attempt ${attempt}/${MAX_RETRIES})`));
        });

        xhr.addEventListener('abort', () => {
          if (signal) {
            signal.removeEventListener('abort', handleAbort);
          }
        });

        xhr.open('PUT', presignedData.url);
        Object.entries(presignedData.headers).forEach(([header, value]) => {
          if (header.toLowerCase() === 'content-length') {
            return;
          }
          // Browser manages Content-Length automatically; only set other signed headers
          xhr.setRequestHeader(header, value);
        });
        xhr.send(file);
      });

      await uploadPromise;
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on cancellation
      if (lastError.message === 'Upload cancelled') {
        throw lastError;
      }

      // Retry on transient 5xx, request errors, and network errors
      const is400 = lastError.message.includes('400');
      const is413 = lastError.message.includes('413');
      const is500 = lastError.message.includes('500');
      const is502 = lastError.message.includes('502');
      const is503 = lastError.message.includes('503');
      const is504 = lastError.message.includes('504');
      const isNetworkError = lastError.message.includes('network error');
      const isTransient5xx = is500 || is502 || is503 || is504;

      if (attempt < MAX_RETRIES && (is400 || is413 || isNetworkError || isTransient5xx)) {
        // Exponential backoff: 100ms, 300ms, 900ms, 2700ms, 8100ms
        const delay = Math.min(100 * Math.pow(3, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry further or non-retryable errors
      break;
    }
  }

  throw lastError || new Error('S3 upload failed after retries');
};

/**
 * Upload a file to S3 using multipart upload with multiple presigned URLs.
 * Each part is uploaded independently with retry support.
 * Returns collected ETags for completion.
 */
const uploadMultipartToS3 = async (
  presignedUrls: string[],
  file: File,
  partSize: number,
  onProgress?: (percentage: number) => void,
  signal?: AbortSignal,
): Promise<{ ETag: string; PartNumber: number }[]> => {
  if (file.size === 0) throw new Error('Cannot upload empty file');
  if (signal?.aborted) throw new Error('Upload cancelled');

  const totalParts = Math.ceil(file.size / partSize);
  const parts: { ETag: string; PartNumber: number }[] = [];
  let uploadedBytes = 0;
  const MAX_RETRIES = 5;

  const uploadSinglePart = (url: string, blob: Blob, partSignal?: AbortSignal): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;

      const cleanup = () => {
        partSignal?.removeEventListener('abort', handleSignalAbort);
        xhr.removeEventListener('load', handleLoad);
        xhr.removeEventListener('error', handleError);
        xhr.removeEventListener('timeout', handleTimeout);
        xhr.removeEventListener('abort', handleXhrAbort);
      };
      const settle = (error?: Error, etag?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(etag ?? '');
      };
      const handleSignalAbort = () => {
        settle(new Error('Upload cancelled'));
        xhr.abort();
      };
      const handleLoad = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
          if (etag) {
            settle(undefined, etag);
          } else {
            settle(
              new Error(
                'Part upload succeeded but ETag header was missing (check S3 CORS ExposeHeaders)',
              ),
            );
          }
        } else {
          settle(new Error(`Part upload failed: ${xhr.status}`));
        }
      };
      const handleError = () => settle(new Error('Part upload network error'));
      const handleTimeout = () => {
        settle(new Error('Part upload timed out'));
        xhr.abort();
      };
      const handleXhrAbort = () => settle(new Error('Upload cancelled'));

      xhr.addEventListener('load', handleLoad);
      xhr.addEventListener('error', handleError);
      xhr.addEventListener('timeout', handleTimeout);
      xhr.addEventListener('abort', handleXhrAbort);
      partSignal?.addEventListener('abort', handleSignalAbort);
      xhr.open('PUT', url);
      xhr.timeout = MULTIPART_PART_TIMEOUT_MS;

      if (partSignal?.aborted) {
        handleSignalAbort();
        return;
      }
      xhr.send(blob);
    });

  const uploadPart = async (partNumber: number) => {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const blob = file.slice(start, end);
    const url = presignedUrls[partNumber - 1];
    if (!url) throw new Error(`Missing presigned URL for part ${partNumber}`);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Upload cancelled');

      try {
        const etag = await uploadSinglePart(url, blob, signal);
        uploadedBytes += blob.size;
        if (onProgress) {
          onProgress((uploadedBytes / file.size) * 100);
        }
        return { ETag: etag, PartNumber: partNumber };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === 'Upload cancelled') throw lastError;
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error(`Part upload failed: ${partNumber}`);
  };

  for (let batchStart = 1; batchStart <= totalParts; batchStart += MULTIPART_UPLOAD_CONCURRENCY) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    const batchEnd = Math.min(batchStart + MULTIPART_UPLOAD_CONCURRENCY, totalParts + 1);
    const batchPartNumbers = Array.from(
      { length: batchEnd - batchStart },
      (_, index) => batchStart + index,
    );
    const batchResults = await Promise.allSettled(batchPartNumbers.map(uploadPart));
    const failedPart = batchResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failedPart) throw failedPart.reason;
    parts.push(
      ...batchResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    );
  }

  return parts.sort((left, right) => left.PartNumber - right.PartNumber);
};

/**
 * Retry failed photo uploads
 * Takes failed files and re-uploads them
 */
const retryFailedUploads = async (
  galleryId: string,
  failedFiles: UploadPreparedFile[],
  onProgress?: (progress: PhotoUploadProgress) => void,
  signal?: AbortSignal,
): Promise<PhotoUploadResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().retryFailedUploads(galleryId, failedFiles, onProgress, signal);
  }

  if (failedFiles.length === 0) {
    return {
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    };
  }

  // Failed uploads have already invalidated their original photo/upload intent.
  // Retry from a clean prepared item so images get a new photo id and videos get
  // a new multipart upload id and fresh part URLs.
  const freshFiles = failedFiles.map(({ file, filename }) => ({ file, filename }));
  return uploadPhotosPresigned(galleryId, freshFiles, onProgress, signal);
};

/**
 * Upload multiple photos using presigned URLs (direct to S3)
 * Optimized for parallel uploads with progress tracking
 */
const uploadPhotosPresigned = async (
  galleryId: string,
  files: UploadPreparedFile[],
  onProgress?: (progress: PhotoUploadProgress) => void,
  signal?: AbortSignal,
): Promise<PhotoUploadResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().uploadPhotosPresigned(galleryId, files, onProgress, signal);
  }

  if (files.length === 0) {
    return {
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    };
  }

  const BATCH_SIZE = 50; // Request presigned URLs in batches of 50
  const INTER_UPLOAD_DELAY_MS = 5; // Delay between uploads
  const PROGRESS_EMIT_INTERVAL_MS = 100;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return (async () => {
    const totalSize = files.reduce((sum, item) => sum + item.file.size, 0);
    const results: PhotoUploadResult[] = [];
    let successfulUploads = 0;
    let failedUploads = 0;
    let completedBytes = 0;
    let cancellationRequested = false;
    const fileProgress = new Map<string, number>();
    const fileStates = new Map<
      string,
      { status: PhotoUploadProgress['files'][string]['status']; error?: string }
    >(files.map((item) => [item.filename, { status: 'queued' }]));
    let lastProgressEmittedAt: number | null = null;

    const emitProgress = (currentFile: string, { force = false }: { force?: boolean } = {}) => {
      if (!onProgress) return;

      const now = Date.now();
      if (
        !force &&
        lastProgressEmittedAt !== null &&
        now - lastProgressEmittedAt < PROGRESS_EMIT_INTERVAL_MS
      ) {
        return;
      }
      lastProgressEmittedAt = now;

      const loaded = completedBytes + Array.from(fileProgress.values()).reduce((a, b) => a + b, 0);
      const percentage = totalSize > 0 ? Math.min(100, Math.round((loaded * 100) / totalSize)) : 0;

      onProgress({
        loaded,
        total: totalSize,
        percentage,
        currentFile,
        successCount: successfulUploads,
        failedCount: failedUploads,
        files: Object.fromEntries(
          files.map((item) => {
            const state = fileStates.get(item.filename) ?? { status: 'queued' as const };
            const uploadedBytes = fileProgress.get(item.filename) ?? 0;
            const percentage =
              state.status === 'success'
                ? 100
                : item.file.size > 0
                  ? Math.min(100, Math.round((uploadedBytes * 100) / item.file.size))
                  : 0;
            return [
              item.filename,
              {
                percentage,
                status: state.status,
                ...(state.error ? { error: state.error } : {}),
              },
            ];
          }),
        ),
      });
    };

    const validFiles: UploadPreparedFile[] = [];
    const rejectedFiles: { item: UploadPreparedFile; error: string }[] = [];
    for (const item of files) {
      const validationError = validateUploadFile(item.file);
      if (validationError) {
        rejectedFiles.push({ item, error: validationError });
      } else {
        validFiles.push(item);
      }
    }

    for (const { item, error } of rejectedFiles) {
      failedUploads++;
      results.push({
        filename: item.filename,
        original_filename: item.filename,
        success: false,
        error,
        retryable: false,
      });
      fileStates.set(item.filename, { status: 'failed', error });
      completedBytes += item.file.size;
      emitProgress(item.filename, { force: true });
    }

    if (validFiles.length === 0) {
      return {
        results,
        total_files: files.length,
        successful_uploads: successfulUploads,
        failed_uploads: failedUploads,
      };
    }

    // Process files in batches
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
      const batch = validFiles.slice(i, i + BATCH_SIZE);
      const batchSuccessfulPhotoIds: string[] = [];
      const batchFailedPhotoIds: string[] = [];

      // 1. Get presigned URLs for batch
      const filesToPresign = batch.filter((f) => {
        // Multipart files: skip re-presign if we already have URLs
        if (f.upload_mode === 'multipart' && f.presigned_urls && f.presigned_urls.length > 0) {
          return false;
        }
        // Single-upload files: skip if presigned data is fresh
        if (
          f.presigned_data &&
          f.presigned_expires_at &&
          f.presigned_expires_at >= Date.now() + 60000
        ) {
          return false;
        }
        return true;
      });

      let presignFailed = false;
      if (filesToPresign.length > 0) {
        try {
          const response = await batchCreateUploadIntents(galleryId, filesToPresign, signal);
          const maxPresignLen = Math.max(filesToPresign.length, response.items.length);
          if (response.items.length !== filesToPresign.length) {
            console.warn('Batch presigned response length mismatch.');
          }
          for (let k = 0; k < maxPresignLen; k++) {
            const returnedItem = response.items[k];
            const file = filesToPresign[k];
            if (!file) continue;

            if (returnedItem && returnedItem.success) {
              if (
                returnedItem.upload_mode === 'multipart' &&
                returnedItem.presigned_urls &&
                returnedItem.presigned_urls.length > 0
              ) {
                file.upload_mode = 'multipart';
                file.upload_id = returnedItem.upload_id;
                file.part_size = returnedItem.part_size;
                file.presigned_urls = returnedItem.presigned_urls;
                file.expected_total_size = returnedItem.expected_total_size;
                file.photo_id = returnedItem.photo_id;
              } else if (returnedItem.presigned_data) {
                file.upload_mode = 'single';
                file.presigned_data = returnedItem.presigned_data;
                file.photo_id = returnedItem.photo_id;
                file.presigned_expires_at = returnedItem.expires_in
                  ? Date.now() + returnedItem.expires_in * 1000
                  : undefined;
              } else {
                file._presignError = 'Server returned no upload data';
              }
            } else {
              // Store error to show in UI
              file._presignError = returnedItem?.error || 'File rejected by server';
            }
          }
        } catch {
          if (signal?.aborted) {
            cancellationRequested = true;
          } else {
            presignFailed = true;
          }
        }
      }

      if (cancellationRequested) break;

      if (presignFailed) {
        // Batch request failed
        for (const file of filesToPresign) {
          failedUploads++;
          results.push({
            filename: file.filename,
            original_filename: file.filename,
            success: false,
            error: 'Failed to get presigned URL',
          });
          fileStates.set(file.filename, {
            status: 'failed',
            error: 'Failed to get presigned URL',
          });
          completedBytes += file.file.size;
          emitProgress(file.filename, { force: true });
        }
      }

      // 2. Upload files to S3 through a bounded worker pool. Four concurrent
      // file jobs restores the established throughput without letting large
      // selections create an unbounded number of browser requests.
      const processFile = async (file: UploadPreparedFile) => {
        if (presignFailed && filesToPresign.includes(file)) {
          return;
        }

        const isMultipart =
          file.upload_mode === 'multipart' && file.presigned_urls && file.presigned_urls.length > 0;
        const hasSinglePresign = file.presigned_data != null;

        if (!isMultipart && !hasSinglePresign) {
          failedUploads++;
          results.push({
            filename: file.filename,
            original_filename: file.filename,
            success: false,
            error: file._presignError || 'File rejected by server',
          });
          fileStates.set(file.filename, {
            status: 'failed',
            error: file._presignError || 'File rejected by server',
          });
          completedBytes += file.file.size;
          emitProgress(file.filename, { force: true });
          await wait(INTER_UPLOAD_DELAY_MS);
          return;
        }

        fileProgress.set(file.filename, 0);
        fileStates.set(file.filename, { status: 'uploading' });
        emitProgress(file.filename, { force: true });

        try {
          if (isMultipart) {
            const partSize = file.part_size || VIDEO_PART_SIZE;
            const parts = await uploadMultipartToS3(
              file.presigned_urls!,
              file.file,
              partSize,
              (percentage) => {
                fileProgress.set(file.filename, Math.round((file.file.size * percentage) / 100));
                emitProgress(file.filename);
              },
              signal,
            );
            file.parts_etags = parts;

            // Complete the multipart upload server-side
            if (file.photo_id && file.upload_id) {
              await completeMultipartUpload(
                galleryId,
                file.photo_id,
                file.upload_id,
                parts,
                signal,
              );
            }
          } else {
            await uploadToS3(
              file.presigned_data!,
              file.file,
              (percentage) => {
                fileProgress.set(file.filename, Math.round((file.file.size * percentage) / 100));
                emitProgress(file.filename);
              },
              signal,
            );
          }

          fileProgress.delete(file.filename);
          completedBytes += file.file.size;
          successfulUploads++;
          // Only single-upload items use batchConfirmUploads
          if (file.photo_id && !isMultipart) {
            batchSuccessfulPhotoIds.push(file.photo_id);
          }

          results.push({
            filename: file.filename,
            original_filename: file.filename,
            success: true,
          });
          fileStates.set(file.filename, { status: 'success' });
        } catch (error) {
          fileProgress.delete(file.filename);
          completedBytes += file.file.size;

          const isCancelled = error instanceof Error && error.message === 'Upload cancelled';
          if (isCancelled) cancellationRequested = true;

          // Always abort multipart uploads to avoid leaked S3 parts and reserved quota.
          // On cancellation the original signal is already aborted, so pass undefined
          // to let the abort API call through on a fresh request.
          if (file.photo_id && isMultipart && file.upload_id) {
            try {
              await abortMultipartUpload(
                galleryId,
                file.photo_id,
                file.upload_id,
                isCancelled ? undefined : signal,
              );
            } catch {
              // Best effort — ignore abort errors
            }
          }

          // Finalize a cancelled single-upload intent as failed so its quota is
          // released, but do not present the user-initiated cancellation as a
          // retryable upload failure.
          if (file.photo_id && !isMultipart) {
            batchFailedPhotoIds.push(file.photo_id);
          }

          // Don't add cancelled uploads to the visible failed list.
          if (!isCancelled) {
            failedUploads++;

            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            results.push({
              filename: file.filename,
              original_filename: file.filename,
              success: false,
              error: errorMessage,
            });
            fileStates.set(file.filename, { status: 'failed', error: errorMessage });
          }
        }

        emitProgress(file.filename, { force: true });
        if (!cancellationRequested) {
          await wait(INTER_UPLOAD_DELAY_MS);
        }
      };

      let nextFileIndex = 0;
      const uploadWorker = async () => {
        while (!cancellationRequested && !signal?.aborted) {
          const file = batch[nextFileIndex];
          nextFileIndex += 1;
          if (!file) return;
          await processFile(file);
        }
      };
      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT_FILE_UPLOADS, batch.length) },
        () => uploadWorker(),
      );
      await Promise.all(workers);

      // 3. Confirm every transferred or failed single-upload intent. This is a
      // control-plane request and deliberately does not reuse the transfer
      // signal: cancellation must not strand files that already reached S3.
      if (batchSuccessfulPhotoIds.length > 0 || batchFailedPhotoIds.length > 0) {
        try {
          await batchConfirmUploads(
            galleryId,
            batchSuccessfulPhotoIds,
            batchFailedPhotoIds,
            undefined,
          );
        } catch (error) {
          console.error('Failed to confirm batch uploads:', error);
          // Non-fatal - uploads are still in S3, just not confirmed
        }
      }

      if (cancellationRequested || signal?.aborted) break;
    }

    const wasCancelled = cancellationRequested || signal?.aborted;
    const resultByFilename = new Map(
      results.map((item) => [item.original_filename || item.filename, item]),
    );
    const orderedResults = files.flatMap((item) => {
      const result = resultByFilename.get(item.filename);
      return result ? [result] : [];
    });

    return {
      results: orderedResults,
      total_files: wasCancelled ? orderedResults.length : files.length,
      successful_uploads: successfulUploads,
      failed_uploads: failedUploads,
    };
  })();
};

export const photoService = {
  deletePhotos,
  deletePhoto,
  renamePhoto,
  downloadGalleryZip,
  downloadSelectedPhotosZip,
  downloadPhoto,
  uploadPhotosPresigned,
  retryFailedUploads,
  completeMultipartUpload,
  abortMultipartUpload,
  isVideoFile,
  isImageFile,
  validateUploadFile,
};
