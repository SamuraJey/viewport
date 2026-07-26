import { useCallback, useMemo, useRef, useState } from 'react';
import { photoService } from '../services/photoService';
import { getMaxUploadSizeBytes } from '../constants/upload';
import { getSafeNameAndExtension } from '../lib/filenameUtils';
import { getUploadFileKey, getUploadValidationError } from '../components/upload/uploadUtils';
import type { UploadJob } from '../components/upload/types';
import type {
  PhotoUploadProgress,
  PhotoUploadResponse,
  UploadPreparedFile,
  UploadRenameWarning,
  PhotoUploadResult,
} from '../types';

export type UploadProgress = PhotoUploadProgress;

interface UploadJobState {
  status: UploadJob['status'];
  progress: number;
  error?: string;
  retryable?: boolean;
}

const mergeUploadResults = (
  previous: PhotoUploadResponse | null,
  incoming: PhotoUploadResponse,
): PhotoUploadResponse => {
  if (!previous) return incoming;

  const merged = [...previous.results];
  incoming.results.forEach((incomingItem) => {
    const incomingName = incomingItem.original_filename || incomingItem.filename;
    const index = merged.findIndex(
      (item) => (item.original_filename || item.filename) === incomingName,
    );
    if (index >= 0) merged[index] = incomingItem;
    else merged.push(incomingItem);
  });

  return {
    results: merged,
    total_files: merged.length,
    successful_uploads: merged.filter((item) => item.success).length,
    failed_uploads: merged.filter((item) => !item.success).length,
  };
};

export const usePhotoUpload = (
  galleryId: string,
  files: File[],
  existingFilenames: string[] = [],
  onFilesChange?: (files: File[]) => void,
) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<PhotoUploadResponse | null>(null);
  const [jobStateById, setJobStateById] = useState<Record<string, UploadJobState>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedFilesRef = useRef<UploadPreparedFile[]>([]);
  const sessionResultRef = useRef<PhotoUploadResponse | null>(null);
  const nextRunGenerationRef = useRef(0);
  const activeRunGenerationRef = useRef<number | null>(null);
  const retryJobStateSnapshotRef = useRef<Record<string, UploadJobState> | null>(null);

  const { preparedFiles, renameWarnings } = useMemo(() => {
    const occupied = new Set(existingFilenames);
    const planned: UploadPreparedFile[] = [];
    const warnings: UploadRenameWarning[] = [];

    for (const file of files) {
      const { stem, ext } = getSafeNameAndExtension(file.name);
      let uniqueName = `${stem}${ext}`;
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

  const preparedByFilename = useMemo(
    () => new Map(preparedFiles.map((item) => [item.filename, item])),
    [preparedFiles],
  );

  const preparedById = useMemo(
    () => new Map(preparedFiles.map((item) => [getUploadFileKey(item.file), item])),
    [preparedFiles],
  );

  const { totalSize, hasLargeFiles, validUploadCount, hasValidFiles, hasInvalidTypes } =
    useMemo(() => {
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const hasLargeFiles = files.some((file) => file.size > getMaxUploadSizeBytes(file));
      const validFiles = files.filter((file) => getUploadValidationError(file) === null);
      return {
        totalSize,
        hasLargeFiles,
        validUploadCount: validFiles.length,
        hasValidFiles: validFiles.length > 0,
        hasInvalidTypes: files.some((file) =>
          getUploadValidationError(file)?.startsWith('Unsupported format'),
        ),
      };
    }, [files]);

  const jobs = useMemo<UploadJob[]>(
    () =>
      preparedFiles.map((item) => {
        const id = getUploadFileKey(item.file);
        const validationError = getUploadValidationError(item.file);
        const state = jobStateById[id];
        const renameWarning = item.filename !== item.file.name ? item.filename : undefined;
        return {
          id,
          file: item.file,
          filename: item.filename,
          status: state?.status ?? (validationError ? 'failed' : 'queued'),
          progress: state?.progress ?? 0,
          error: state?.error ?? validationError ?? undefined,
          retryable: validationError ? false : state?.retryable,
          renameWarning,
        };
      }),
    [jobStateById, preparedFiles],
  );

  const syncFailedFiles = useCallback(
    (uploadResult: PhotoUploadResponse) => {
      failedFilesRef.current = uploadResult.results
        .filter((item) => !item.success && item.retryable !== false)
        .map((item) => preparedByFilename.get(item.original_filename || item.filename))
        .filter((item): item is UploadPreparedFile => item !== undefined);
    },
    [preparedByFilename],
  );

  const applyProgress = useCallback(
    (nextProgress: PhotoUploadProgress, runGeneration: number) => {
      if (activeRunGenerationRef.current !== runGeneration) return;
      setProgress(nextProgress);
      setJobStateById((current) => {
        const next = { ...current };
        Object.entries(nextProgress.files).forEach(([filename, fileProgress]) => {
          const prepared = preparedByFilename.get(filename);
          if (!prepared) return;
          next[getUploadFileKey(prepared.file)] = {
            status: fileProgress.status,
            progress: fileProgress.percentage,
            error: fileProgress.error,
            retryable: fileProgress.status === 'failed' ? true : undefined,
          };
        });
        return next;
      });
    },
    [preparedByFilename],
  );

  const applyResult = useCallback(
    (uploadResult: PhotoUploadResponse, runGeneration: number) => {
      if (activeRunGenerationRef.current !== runGeneration) return;
      setJobStateById((current) => {
        const next = { ...current };
        uploadResult.results.forEach((item) => {
          const prepared = preparedByFilename.get(item.original_filename || item.filename);
          if (!prepared) return;
          next[getUploadFileKey(prepared.file)] = {
            status: item.success ? 'success' : 'failed',
            progress: item.success ? 100 : 0,
            error: item.error,
            retryable: item.retryable,
          };
        });
        return next;
      });
      sessionResultRef.current = uploadResult;
      setResult(uploadResult);
      syncFailedFiles(uploadResult);
    },
    [preparedByFilename, syncFailedFiles],
  );

  const handleRemoveFile = useCallback(
    (fileIndex: number) => {
      onFilesChange?.(files.filter((_, index) => index !== fileIndex));
    },
    [files, onFilesChange],
  );

  const handleRemoveJob = useCallback(
    (jobId: string) => {
      onFilesChange?.(files.filter((file) => getUploadFileKey(file) !== jobId));
      setJobStateById((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
    },
    [files, onFilesChange],
  );

  const handleReorderJobs = useCallback(
    (orderedJobs: UploadJob[]) => {
      onFilesChange?.(orderedJobs.map((job) => job.file));
    },
    [onFilesChange],
  );

  const handleReplaceFile = useCallback(
    (index: number, newFile: File) => {
      onFilesChange?.([...files.slice(0, index), newFile, ...files.slice(index + 1)]);
    },
    [files, onFilesChange],
  );

  const handleReplaceJob = useCallback(
    (jobId: string, newFile: File) => {
      const index = files.findIndex((file) => getUploadFileKey(file) === jobId);
      if (index < 0) return;
      handleReplaceFile(index, newFile);
      setJobStateById((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
    },
    [files, handleReplaceFile],
  );

  const handleUpload = useCallback(async () => {
    if (!hasValidFiles || isUploading) return;
    retryJobStateSnapshotRef.current = null;
    setIsUploading(true);
    setProgress(null);
    setResult(null);
    sessionResultRef.current = null;
    failedFilesRef.current = [];
    setJobStateById(
      Object.fromEntries(
        preparedFiles.map((item) => {
          const validationError = getUploadValidationError(item.file);
          return [
            getUploadFileKey(item.file),
            {
              status: validationError ? 'failed' : 'queued',
              progress: 0,
              error: validationError ?? undefined,
              retryable: validationError ? false : undefined,
            } satisfies UploadJobState,
          ];
        }),
      ),
    );

    const runGeneration = ++nextRunGenerationRef.current;
    activeRunGenerationRef.current = runGeneration;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const uploadResult = await photoService.uploadPhotosPresigned(
        galleryId,
        preparedFiles,
        (nextProgress) => applyProgress(nextProgress, runGeneration),
        abortController.signal,
      );
      applyResult(uploadResult, runGeneration);
    } catch {
      if (!abortController.signal.aborted) {
        const failedResult: PhotoUploadResponse = {
          results: preparedFiles.map(
            (item): PhotoUploadResult => ({
              filename: item.filename,
              original_filename: item.filename,
              success: false,
              error: 'Upload failed. Check your connection and retry this file.',
            }),
          ),
          total_files: preparedFiles.length,
          successful_uploads: 0,
          failed_uploads: preparedFiles.length,
        };
        applyResult(failedResult, runGeneration);
      }
    } finally {
      if (activeRunGenerationRef.current === runGeneration) {
        activeRunGenerationRef.current = null;
        setIsUploading(false);
        setProgress(null);
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    }
  }, [applyProgress, applyResult, galleryId, hasValidFiles, isUploading, preparedFiles]);

  const retryPreparedFiles = useCallback(
    async (items: UploadPreparedFile[]) => {
      if (items.length === 0 || isUploading) return;
      const previousResult = sessionResultRef.current;
      retryJobStateSnapshotRef.current = Object.fromEntries(
        items.flatMap((item) => {
          const id = getUploadFileKey(item.file);
          const state = jobStateById[id];
          return state ? [[id, state] as const] : [];
        }),
      );
      setIsUploading(true);
      setProgress(null);
      setJobStateById((current) => {
        const next = { ...current };
        items.forEach((item) => {
          next[getUploadFileKey(item.file)] = {
            status: 'uploading',
            progress: 0,
          };
        });
        return next;
      });

      const runGeneration = ++nextRunGenerationRef.current;
      activeRunGenerationRef.current = runGeneration;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      try {
        const retryResult = await photoService.retryFailedUploads(
          galleryId,
          items,
          (nextProgress) => applyProgress(nextProgress, runGeneration),
          abortController.signal,
        );
        applyResult(mergeUploadResults(previousResult, retryResult), runGeneration);
      } catch {
        if (abortController.signal.aborted) return;
        const retryFailure: PhotoUploadResponse = {
          results: items.map((item) => ({
            filename: item.filename,
            original_filename: item.filename,
            success: false,
            error: 'Retry failed. Check your connection and try again.',
          })),
          total_files: items.length,
          successful_uploads: 0,
          failed_uploads: items.length,
        };
        applyResult(mergeUploadResults(previousResult, retryFailure), runGeneration);
      } finally {
        if (activeRunGenerationRef.current === runGeneration) {
          activeRunGenerationRef.current = null;
          retryJobStateSnapshotRef.current = null;
          setIsUploading(false);
          setProgress(null);
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
          }
        }
      }
    },
    [applyProgress, applyResult, galleryId, isUploading, jobStateById],
  );

  const handleRetryFile = useCallback(
    async (jobId: string) => {
      const prepared = preparedById.get(jobId);
      if (!prepared || getUploadValidationError(prepared.file)) return;
      await retryPreparedFiles([prepared]);
    },
    [preparedById, retryPreparedFiles],
  );

  const handleRetryFailed = useCallback(async () => {
    await retryPreparedFiles(failedFilesRef.current);
  }, [retryPreparedFiles]);

  const cancelUpload = useCallback(() => {
    const retryJobStateSnapshot = retryJobStateSnapshotRef.current;
    retryJobStateSnapshotRef.current = null;
    activeRunGenerationRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setJobStateById((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, state]) => [
          id,
          state.status === 'uploading'
            ? (retryJobStateSnapshot?.[id] ?? {
                ...state,
                status: 'queued',
                progress: 0,
                error: undefined,
                retryable: undefined,
              })
            : state,
        ]),
      ),
    );
    setProgress(null);
    setResult(null);
    setIsUploading(false);
  }, []);

  return {
    isUploading,
    progress,
    result,
    setResult,
    jobs,
    totalSize,
    hasLargeFiles,
    validUploadCount,
    hasValidFiles,
    hasInvalidTypes,
    renameWarnings,
    handleRemoveFile,
    handleRemoveJob,
    handleReorderJobs,
    handleReplaceFile,
    handleReplaceJob,
    handleUpload,
    handleRetryFile,
    handleRetryFailed,
    cancelUpload,
    failedFilesRef,
  };
};
