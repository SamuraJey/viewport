import { useState, useRef, useCallback, useMemo } from 'react';
import { photoService } from '../services/photoService';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../constants/upload';
import type { PhotoUploadResponse } from '../services/photoService';
import type { UploadPreparedFile, UploadRenameWarning } from '../types';

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
  existingFilenames: string[] = [],
  onFilesChange?: (files: File[]) => void,
) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<PhotoUploadResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedFilesRef = useRef<UploadPreparedFile[]>([]);

  const { preparedFiles, renameWarnings } = useMemo(() => {
    const occupied = new Set(existingFilenames);
    const planned: UploadPreparedFile[] = [];
    const warnings: UploadRenameWarning[] = [];

    const splitNameAndExt = (filename: string): { stem: string; ext: string } => {
      const dotIndex = filename.lastIndexOf('.');
      if (dotIndex <= 0 || dotIndex === filename.length - 1) {
        return { stem: filename, ext: '' };
      }
      return {
        stem: filename.slice(0, dotIndex),
        ext: filename.slice(dotIndex),
      };
    };

    for (const file of files) {
      const { stem, ext } = splitNameAndExt(file.name);
      let uniqueName = file.name;
      let counter = 1;

      while (occupied.has(uniqueName)) {
        uniqueName = `${stem} (${counter})${ext}`;
        counter += 1;
      }

      occupied.add(uniqueName);

      if (uniqueName !== file.name) {
        warnings.push({ original: file.name, unique: uniqueName });
      }

      planned.push({ file, filename: uniqueName });
    }

    return { preparedFiles: planned, renameWarnings: warnings };
  }, [files, existingFilenames]);

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
    (fileIndex: number) => {
      const updatedFiles = files.filter((_, index) => index !== fileIndex);
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
        preparedFiles,
        setProgress,
        abortControllerRef.current.signal,
      );

      const preparedByName = new Map(preparedFiles.map((item) => [item.filename, item]));

      failedFilesRef.current = uploadResult.results
        .filter((r) => !r.success && r.retryable !== false)
        .map((r) => preparedByName.get(r.original_filename || r.filename))
        .filter((item) => item !== undefined) as UploadPreparedFile[];

      setResult(uploadResult);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('cancelled'))) {
        console.error('Upload failed:', error);
        setResult({
          results: preparedFiles.map((item) => ({
            filename: item.filename,
            success: false,
            error: 'Upload failed',
          })),
          total_files: preparedFiles.length,
          successful_uploads: 0,
          failed_uploads: preparedFiles.length,
        });
        failedFilesRef.current = preparedFiles;
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [galleryId, hasValidFiles, preparedFiles]);

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

      const retryByName = new Map(failedFilesRef.current.map((item) => [item.filename, item]));

      failedFilesRef.current = retryResult.results
        .filter((r) => !r.success && r.retryable !== false)
        .map((r) => retryByName.get(r.filename))
        .filter((item) => item !== undefined) as UploadPreparedFile[];

      setResult(retryResult);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('cancelled'))) {
        console.error('Retry failed:', error);
        setResult({
          results: failedFilesRef.current.map((item) => ({
            filename: item.filename,
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
  }, [galleryId]);

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
    renameWarnings,
    handleRemoveFile,
    handleUpload,
    handleRetryFailed,
    cancelUpload,
    failedFilesRef,
  };
};
