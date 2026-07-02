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
  UploadPreparedFile,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadResponse,
  PendingUpload,
} from '../types';
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_MB } from '../constants/upload';

const DOWNLOAD_TARGET_NAME = 'viewport-browser-download';
const DOWNLOAD_TARGET_ID = 'viewport-browser-download-frame';

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
      content_type: item.file.type,
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
 * Retry failed photo uploads
 * Takes failed files and re-uploads them
 */
const retryFailedUploads = async (
  galleryId: string,
  failedFiles: UploadPreparedFile[],
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    currentFile: string;
    successCount: number;
    failedCount: number;
  }) => void,
  signal?: AbortSignal,
): Promise<PhotoUploadResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().retryFailedUploads(galleryId, failedFiles, onProgress);
  }

  if (failedFiles.length === 0) {
    return {
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    };
  }

  // Use same batch upload logic as uploadPhotosPresigned
  return uploadPhotosPresigned(galleryId, failedFiles, onProgress, signal);
};

/**
 * Upload multiple photos using presigned URLs (direct to S3)
 * Optimized for parallel uploads with progress tracking
 */

/**
 * Get PENDING photo records for a gallery (e.g., uploads that were never confirmed).
 */
const getPendingUploads = async (galleryId: string): Promise<PendingUpload[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPendingUploads(galleryId);
  }
  const response = await api.get(`/galleries/${galleryId}/photos/pending-uploads`);
  return response.data;
};
const uploadPhotosPresigned = async (
  galleryId: string,
  files: UploadPreparedFile[],
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    currentFile: string;
    successCount: number;
    failedCount: number;
  }) => void,
  signal?: AbortSignal,
): Promise<PhotoUploadResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().uploadPhotosPresigned(galleryId, files, onProgress);
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

  return (async () => {
    const totalSize = files.reduce((sum, item) => sum + item.file.size, 0);
    const results: PhotoUploadResult[] = [];
    let successfulUploads = 0;
    let failedUploads = 0;
    let completedBytes = 0;

    const emitProgress = (currentFile: string) => {
      if (!onProgress) return;
      const percentage =
        totalSize > 0 ? Math.min(100, Math.round((completedBytes * 100) / totalSize)) : 0;
      onProgress({
        loaded: completedBytes,
        total: totalSize,
        percentage,
        currentFile,
        successCount: successfulUploads,
        failedCount: failedUploads,
      });
    };

    const oversizeMessage = `File exceeds maximum size of ${MAX_UPLOAD_FILE_SIZE_MB}MB`;
    const validFiles: UploadPreparedFile[] = [];
    const oversizedFiles: UploadPreparedFile[] = [];
    for (const item of files) {
      if (item.file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        oversizedFiles.push(item);
      } else {
        validFiles.push(item);
      }
    }

    for (const item of oversizedFiles) {
      failedUploads++;
      results.push({
        filename: item.filename,
        original_filename: item.filename,
        success: false,
        error: oversizeMessage,
        retryable: false,
      });
      completedBytes += item.file.size;
      emitProgress(item.filename);
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
      const filesToPresign = batch.filter(
        (f) =>
          !f.presigned_data ||
          !f.presigned_expires_at ||
          f.presigned_expires_at < Date.now() + 60000,
      );

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

            if (returnedItem && returnedItem.success && returnedItem.presigned_data) {
              file.presigned_data = returnedItem.presigned_data;
              file.photo_id = returnedItem.photo_id;
              file.presigned_expires_at = returnedItem.expires_in
                ? Date.now() + returnedItem.expires_in * 1000
                : undefined;
            } else {
              file._presignError = returnedItem?.error || 'File rejected by server';
            }
          }
        } catch {
          presignFailed = true;
        }
      }

      if (presignFailed) {
        for (const file of filesToPresign) {
          failedUploads++;
          results.push({
            filename: file.filename,
            original_filename: file.filename,
            success: false,
            error: 'Failed to get presigned URL',
          });
          completedBytes += file.file.size;
        }
      }

      // 2. Separate uploadable vs skipped files
      const skipped: UploadPreparedFile[] = [];
      const uploadable: UploadPreparedFile[] = [];
      for (const file of batch) {
        if (presignFailed && filesToPresign.includes(file)) {
          continue; // already handled above
        }
        if (!file.presigned_data) {
          skipped.push(file);
        } else {
          uploadable.push(file);
        }
      }

      for (const file of skipped) {
        failedUploads++;
        results.push({
          filename: file.filename,
          original_filename: file.filename,
          success: false,
          error: file._presignError || 'File rejected by server',
        });
        completedBytes += file.file.size;
        emitProgress(file.filename);
      }

      // 3. Concurrent upload for eligible files
      if (uploadable.length > 0) {
        const UPLOAD_CONCURRENCY = 4;
        const queue = [...uploadable];

        interface WorkerResult {
          results: PhotoUploadResult[];
          successfulUploads: number;
          failedUploads: number;
          bytesUploaded: number;
          successfulIds: string[];
          failedIds: string[];
        }

        const worker = async (): Promise<WorkerResult> => {
          const wr: WorkerResult = {
            results: [],
            successfulUploads: 0,
            failedUploads: 0,
            bytesUploaded: 0,
            successfulIds: [],
            failedIds: [],
          };

          while (queue.length > 0) {
            const file = queue.shift()!;

            try {
              await uploadToS3(
                file.presigned_data!,
                file.file,
                undefined, // no per-chunk progress in concurrent mode
                signal,
              );

              wr.bytesUploaded += file.file.size;
              wr.successfulUploads++;
              if (file.photo_id) {
                wr.successfulIds.push(file.photo_id);
              }
              wr.results.push({
                filename: file.filename,
                original_filename: file.filename,
                success: true,
              });
            } catch (error) {
              wr.bytesUploaded += file.file.size;
              if (!(error instanceof Error && error.message === 'Upload cancelled')) {
                wr.failedUploads++;
                if (file.photo_id) {
                  wr.failedIds.push(file.photo_id);
                }
                wr.results.push({
                  filename: file.filename,
                  original_filename: file.filename,
                  success: false,
                  error: error instanceof Error ? error.message : 'Upload failed',
                });
              }
            }
          }

          return wr;
        };

        const workerResults = await Promise.all(
          Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()),
        );

        for (const wr of workerResults) {
          results.push(...wr.results);
          successfulUploads += wr.successfulUploads;
          failedUploads += wr.failedUploads;
          completedBytes += wr.bytesUploaded;
          batchSuccessfulPhotoIds.push(...wr.successfulIds);
          batchFailedPhotoIds.push(...wr.failedIds);
        }

        // Emit one progress update after the concurrent batch completes
        emitProgress('batch');
      }

      // 4. Confirm batch uploads
      if (batchSuccessfulPhotoIds.length > 0 || batchFailedPhotoIds.length > 0) {
        try {
          await batchConfirmUploads(
            galleryId,
            batchSuccessfulPhotoIds,
            batchFailedPhotoIds,
            signal,
          );
        } catch (error) {
          console.error('Failed to confirm batch uploads:', error);
        }
      }
    }

    return {
      results,
      total_files: files.length,
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
  getPendingUploads,
};
