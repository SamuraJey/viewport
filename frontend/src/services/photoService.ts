import { api } from '../lib/api';
import type {
  PhotoConfirmUploadResponse,
  PhotoResponse,
  PhotoUploadIntentRequest,
  PhotoUploadIntentResponse,
  PhotoUrlResponse,
  PhotoUploadResult,
  PhotoUploadResponse,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  BatchPresignedUploadItem,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadResponse,
} from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Re-export types for backward compatibility
export type {
  PhotoConfirmUploadResponse,
  PhotoResponse,
  PhotoUploadIntentRequest,
  PhotoUploadIntentResponse,
  PhotoUrlResponse,
  PhotoUploadResult,
  PhotoUploadResponse,
};

const uploadPhoto = async (galleryId: string, file: File): Promise<PhotoResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<PhotoResponse>(`/galleries/${galleryId}/photos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

const deletePhoto = async (galleryId: string, photoId: string): Promise<void> => {
  await api.delete(`/galleries/${galleryId}/photos/${photoId}`);
};

const renamePhoto = async (
  galleryId: string,
  photoId: string,
  filename: string,
): Promise<PhotoResponse> => {
  const response = await api.patch<PhotoResponse>(
    `/galleries/${galleryId}/photos/${photoId}/rename`,
    {
      filename,
    },
  );
  return response.data;
};

const getPhotoUrl = async (galleryId: string, photoId: string): Promise<PhotoUrlResponse> => {
  const response = await api.get<PhotoUrlResponse>(`/galleries/${galleryId}/photos/${photoId}/url`);
  return response.data;
};

const getPhotoUrlDirect = async (photoId: string): Promise<PhotoUrlResponse> => {
  const response = await api.get<PhotoUrlResponse>(`/photos/auth/${photoId}/url`);
  return response.data;
};

const uploadPhotos = async (
  galleryId: string,
  files: File[],
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    currentFile: string;
    currentBatch?: number;
    totalBatches?: number;
  }) => void,
): Promise<PhotoUploadResponse> => {
  // Optimized batch settings for faster uploads:
  // - Smaller batches = faster individual requests, better parallelism
  // - Higher concurrency = more parallel uploads to backend
  const BATCH_SIZE = 15; // Smaller batches for faster response times
  const MAX_CONCURRENCY = 4; // More parallel batch uploads

  if (files.length === 0) {
    return {
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    };
  }

  const batches: { index: number; files: File[] }[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push({ index: batches.length, files: files.slice(i, i + BATCH_SIZE) });
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalBatches = batches.length;

  const allResults: PhotoUploadResult[] = [];
  let successfulUploads = 0;
  let failedUploads = 0;

  let completedBytes = 0;
  const inFlightBytes = new Map<number, number>();
  const batchSizes = new Map<number, number>();

  const emitProgress = (currentBatchIndex: number, currentFileName: string) => {
    if (!onProgress) {
      return;
    }

    const inFlightTotal = Array.from(inFlightBytes.values()).reduce((sum, value) => sum + value, 0);
    const loaded = completedBytes + inFlightTotal;
    const percentage = totalSize > 0 ? Math.min(100, Math.round((loaded * 100) / totalSize)) : 0;

    onProgress({
      loaded,
      total: totalSize,
      percentage,
      currentFile: currentFileName,
      currentBatch: currentBatchIndex + 1,
      totalBatches,
    });
  };

  const updateProgress = (batchIndex: number, loadedInBatch: number) => {
    if (!onProgress) {
      return;
    }

    const batchSize = batchSizes.get(batchIndex) ?? 0;
    const clampedLoaded = Math.min(loadedInBatch, batchSize);
    inFlightBytes.set(batchIndex, clampedLoaded);

    const firstFileName = batches[batchIndex]?.files[0]?.name ?? 'Uploading...';
    emitProgress(batchIndex, firstFileName);
  };

  const processBatch = async (batch: { index: number; files: File[] }) => {
    const formData = new FormData();
    batch.files.forEach((file) => formData.append('files', file));

    const batchSize = batch.files.reduce((sum, file) => sum + file.size, 0);
    batchSizes.set(batch.index, batchSize);

    try {
      const response = await api.post<PhotoUploadResponse>(
        `/galleries/${galleryId}/photos/batch`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 120000, // 2 minute timeout for uploads
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              updateProgress(batch.index, progressEvent.loaded);
            } else {
              updateProgress(batch.index, Math.min(progressEvent.loaded, batchSize));
            }
          },
        },
      );

      inFlightBytes.delete(batch.index);
      completedBytes += batchSize;
      emitProgress(batch.index, batch.files[0]?.name ?? 'Completed');

      allResults.push(...response.data.results);
      successfulUploads += response.data.successful_uploads;
      failedUploads += response.data.failed_uploads;
    } catch (error) {
      inFlightBytes.delete(batch.index);
      completedBytes += batchSize;

      const failedResults: PhotoUploadResult[] = batch.files.map((file) => ({
        filename: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }));

      allResults.push(...failedResults);
      failedUploads += batch.files.length;
      emitProgress(batch.index, batch.files[0]?.name ?? 'Failed');
    }
  };

  let nextBatchIndex = 0;

  const worker = async () => {
    while (nextBatchIndex < batches.length) {
      const currentIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const batch = batches[currentIndex];
      await processBatch(batch);
    }
  };

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, batches.length) }, () => worker());
  await Promise.all(workers);

  return {
    results: allResults,
    total_files: files.length,
    successful_uploads: successfulUploads,
    failed_uploads: failedUploads,
  };
};

const getAllPhotoUrls = async (galleryId: string): Promise<PhotoResponse[]> => {
  const response = await api.get<PhotoResponse[]>(`/galleries/${galleryId}/photos/urls`);
  return response.data;
};

// Presigned upload methods
const createUploadIntent = async (
  galleryId: string,
  request: PhotoUploadIntentRequest,
  signal?: AbortSignal,
): Promise<PhotoUploadIntentResponse> => {
  const response = await api.post<PhotoUploadIntentResponse>(
    `/galleries/${galleryId}/photos/upload-intent`,
    request,
    { signal },
  );
  return response.data;
};

const confirmUpload = async (
  galleryId: string,
  photoId: string,
  signal?: AbortSignal,
): Promise<PhotoConfirmUploadResponse> => {
  const response = await api.post<PhotoConfirmUploadResponse>(
    `/galleries/${galleryId}/photos/confirm-upload`,
    { photo_id: photoId },
    { signal },
  );
  return response.data;
};

const batchCreateUploadIntents = async (
  galleryId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<BatchPresignedUploadsResponse> => {
  const request: BatchPresignedUploadsRequest = {
    files: files.map((file) => ({
      filename: file.name,
      file_size: file.size,
      content_type: file.type,
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
  presignedData: { url: string; fields: Record<string, string> },
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
      const formData = new FormData();

      // Only include essential fields to minimize multipart header size (RustFS has 64KB buffer limit)
      // Order matters for S3 signature validation - AWS expects fields in specific order before file
      const essentialFields = [
        'key',
        'policy',
        'x-amz-algorithm',
        'x-amz-credential',
        'x-amz-date',
        'x-amz-signature',
        'x-amz-tagging',
      ];

      essentialFields.forEach((fieldName) => {
        if (fieldName in presignedData.fields) {
          formData.append(fieldName, presignedData.fields[fieldName]);
        }
      });

      // Add file LAST - required by S3 signature validation
      formData.append('file', file);

      // Direct fetch to S3 (не через api instance, чтобы не добавлялись auth headers)
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

        xhr.open('POST', presignedData.url);
        xhr.send(formData);
      });

      await uploadPromise;
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on cancellation
      if (lastError.message === 'Upload cancelled') {
        throw lastError;
      }

      // Only retry on 400/413 (request errors), not network errors
      const is400 = lastError.message.includes('400');
      const is413 = lastError.message.includes('413');
      const isNetworkError = lastError.message.includes('network error');

      if (attempt < MAX_RETRIES && (is400 || is413 || isNetworkError)) {
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
 * Upload a single photo using presigned URL (direct to S3)
 *
 * Flow:
 * 1. Request upload intent (get presigned URL)
 * 2. Upload file directly to S3
 * 3. Confirm upload with backend
 */
const uploadPhotoPresigned = async (
  galleryId: string,
  file: File,
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void,
  signal?: AbortSignal,
): Promise<{ photo_id: string }> => {
  // 1. Get upload intent
  const intent = await createUploadIntent(
    galleryId,
    {
      filename: file.name,
      file_size: file.size,
      content_type: file.type,
    },
    signal,
  );

  // 2. Upload to S3
  await uploadToS3(
    intent.presigned_data,
    file,
    (percentage) => {
      if (onProgress) {
        onProgress({
          loaded: Math.round((file.size * percentage) / 100),
          total: file.size,
          percentage,
        });
      }
    },
    signal,
  );

  // 3. Confirm upload
  await confirmUpload(galleryId, intent.photo_id, signal);

  return { photo_id: intent.photo_id };
};

/**
 * Retry failed photo uploads
 * Takes failed files and re-uploads them
 */
const retryFailedUploads = async (
  galleryId: string,
  failedFiles: File[],
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
const uploadPhotosPresigned = async (
  galleryId: string,
  files: File[],
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
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return (async () => {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const results: PhotoUploadResult[] = [];
    let successfulUploads = 0;
    let failedUploads = 0;
    let completedBytes = 0;
    const fileProgress = new Map<string, number>();

    const emitProgress = (currentFile: string) => {
      if (!onProgress) return;

      const loaded = completedBytes + Array.from(fileProgress.values()).reduce((a, b) => a + b, 0);
      const percentage = totalSize > 0 ? Math.min(100, Math.round((loaded * 100) / totalSize)) : 0;

      onProgress({
        loaded,
        total: totalSize,
        percentage,
        currentFile,
        successCount: successfulUploads,
        failedCount: failedUploads,
      });
    };

    const oversizeMessage = `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    const validFiles: File[] = [];
    const oversizedFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(file);
      } else {
        validFiles.push(file);
      }
    }

    for (const file of oversizedFiles) {
      failedUploads++;
      results.push({
        filename: file.name,
        success: false,
        error: oversizeMessage,
        retryable: false,
      });
      completedBytes += file.size;
      emitProgress(file.name);
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
      let batchItems: BatchPresignedUploadItem[] = [];
      try {
        const response = await batchCreateUploadIntents(galleryId, batch, signal);
        batchItems = response.items;
      } catch {
        // Batch request failed
        for (const file of batch) {
          failedUploads++;
          results.push({
            filename: file.name,
            success: false,
            error: 'Failed to get presigned URL',
          });
          completedBytes += file.size;
        }
        continue;
      }

      const maxLen = Math.max(batch.length, batchItems.length);
      if (batchItems.length !== batch.length) {
        console.warn(
          'Batch presigned response length mismatch: some files may have been rejected by the server.',
        );
      }

      // 2. Upload files to S3, skipping rejected entries
      for (let j = 0; j < maxLen; j++) {
        const file = batch[j];
        const item = batchItems[j];

        if (!file) {
          continue;
        }

        if (!item || !item.success || !item.presigned_data) {
          failedUploads++;
          results.push({
            filename: file.name,
            success: false,
            error: item?.error ?? 'File rejected by server',
          });
          completedBytes += file.size;
          emitProgress(file.name);
          await wait(INTER_UPLOAD_DELAY_MS);
          continue;
        }

        fileProgress.set(file.name, 0);

        try {
          await uploadToS3(
            item.presigned_data,
            file,
            (percentage) => {
              fileProgress.set(file.name, Math.round((file.size * percentage) / 100));
              emitProgress(file.name);
            },
            signal,
          );

          fileProgress.delete(file.name);
          completedBytes += file.size;
          successfulUploads++;
          if (item.photo_id) {
            batchSuccessfulPhotoIds.push(item.photo_id);
          }

          results.push({
            filename: file.name,
            success: true,
          });
        } catch (error) {
          fileProgress.delete(file.name);
          completedBytes += file.size;

          // Don't add cancelled uploads to failed list
          if (!(error instanceof Error && error.message === 'Upload cancelled')) {
            failedUploads++;
            if (item.photo_id) {
              batchFailedPhotoIds.push(item.photo_id);
            }

            results.push({
              filename: file.name,
              success: false,
              error: error instanceof Error ? error.message : 'Upload failed',
            });
          }
        }

        emitProgress(file.name);
        await wait(INTER_UPLOAD_DELAY_MS);
      }

      // 3. Confirm batch uploads immediately after batch is uploaded
      if (batchSuccessfulPhotoIds.length > 0 || batchFailedPhotoIds.length > 0) {
        try {
          await batchConfirmUploads(galleryId, batchSuccessfulPhotoIds, batchFailedPhotoIds, signal);
        } catch (error) {
          console.error('Failed to confirm batch uploads:', error);
          // Non-fatal - uploads are still in S3, just not confirmed
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
  uploadPhoto,
  uploadPhotos,
  deletePhoto,
  renamePhoto,
  getPhotoUrl,
  getPhotoUrlDirect,
  getAllPhotoUrls,
  // Presigned upload methods
  createUploadIntent,
  uploadToS3,
  confirmUpload,
  uploadPhotoPresigned,
  uploadPhotosPresigned,
  retryFailedUploads,
  // Batch upload methods
  batchCreateUploadIntents,
  batchConfirmUploads,
};
