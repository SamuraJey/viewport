import { useState, useRef, useCallback, useMemo } from 'react';
import { photoService } from '../services/photoService';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../constants/upload';
import type { PhotoUploadResponse } from '../services/photoService';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentFile: string;
  currentBatch?: number;
  totalBatches?: number;
  successCount?: number;
  failedCount?: number;
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const usePhotoUpload = (
  galleryId: string,
  files: File[],
  onFilesChange?: (files: File[]) => void,
) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<PhotoUploadResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedFilesRef = useRef<File[]>([]);

  const { totalSize, hasLargeFiles, validUploadCount, hasValidFiles, hasInvalidTypes } =
    useMemo(() => {
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const hasLargeFiles = files.some((file) => file.size > MAX_UPLOAD_FILE_SIZE_BYTES);
      const validFiles = files.filter(
        (file) => file.size <= MAX_UPLOAD_FILE_SIZE_BYTES && SUPPORTED_TYPES.includes(file.type),
      );
      const validUploadCount = validFiles.length;
      const hasValidFiles = validUploadCount > 0;
      const hasInvalidTypes = files.some((file) => !SUPPORTED_TYPES.includes(file.type));
      return { totalSize, hasLargeFiles, validUploadCount, hasValidFiles, hasInvalidTypes };
    }, [files]);

  const handleRemoveFile = useCallback(
    (fileName: string) => {
      const updatedFiles = files.filter((f) => f.name !== fileName);
      onFilesChange?.(updatedFiles);
    },
    [files, onFilesChange],
  );

  const handleUpload = useCallback(async () => {
    if (!hasValidFiles) return;
    setIsUploading(true);
    setProgress(null);
    setResult(null);
    failedFilesRef.current = [];

    abortControllerRef.current = new AbortController();

    try {
      const uploadResult = await photoService.uploadPhotosPresigned(
        galleryId,
        files,
        setProgress,
        abortControllerRef.current.signal,
      );

      failedFilesRef.current = uploadResult.results
        .filter((r) => !r.success && r.retryable !== false)
        .map((r) => files.find((f) => f.name === r.filename))
        .filter((f) => f !== undefined) as File[];

      setResult(uploadResult);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('cancelled'))) {
        console.error('Upload failed:', error);
        setResult({
          results: files.map((file) => ({
            filename: file.name,
            success: false,
            error: 'Upload failed',
          })),
          total_files: files.length,
          successful_uploads: 0,
          failed_uploads: files.length,
        });
        failedFilesRef.current = files;
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [galleryId, files, hasValidFiles]);

  const handleRetryFailed = useCallback(async () => {
    if (failedFilesRef.current.length === 0) return;

    setIsUploading(true);
    setProgress(null);
    setResult(null);

    abortControllerRef.current = new AbortController();

    try {
      const retryResult = await photoService.retryFailedUploads(
        galleryId,
        failedFilesRef.current,
        setProgress,
        abortControllerRef.current.signal,
      );

      failedFilesRef.current = retryResult.results
        .filter((r) => !r.success && r.retryable !== false)
        .map((r) => files.find((f) => f.name === r.filename))
        .filter((f) => f !== undefined) as File[];

      setResult(retryResult);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('cancelled'))) {
        console.error('Retry failed:', error);
        setResult({
          results: failedFilesRef.current.map((file) => ({
            filename: file.name,
            success: false,
            error: 'Retry failed',
          })),
          total_files: failedFilesRef.current.length,
          successful_uploads: 0,
          failed_uploads: failedFilesRef.current.length,
        });
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [galleryId, files]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProgress(null);
    setResult(null);
    setIsUploading(false);
  }, []);

  return {
    isUploading,
    progress,
    result,
    setResult,
    totalSize,
    hasLargeFiles,
    validUploadCount,
    hasValidFiles,
    hasInvalidTypes,
    handleRemoveFile,
    handleUpload,
    handleRetryFailed,
    cancelUpload,
    failedFilesRef,
  };
};
