import type { Accept, FileRejection } from 'react-dropzone';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_TYPES,
  getMaxUploadSizeBytes,
  getUploadContentType,
  isImageUploadFile,
  isVideoUploadFile,
} from '../../constants/upload';

export const MAX_DROPZONE_FILE_SIZE = MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES;

export const ACCEPTED_MIME_TYPES: Accept = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/jpg': ['.jpg'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-m4v': ['.m4v'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
  'video/x-msvideo': ['.avi'],
  'video/mpeg': ['.mpeg', '.mpg'],
  'video/3gpp': ['.3gp'],
};

export const describeUploadRejections = (rejections: FileRejection[]): string => {
  const firstError = rejections[0]?.errors[0]?.message;
  const rejectedCount = rejections.length;
  return `${rejectedCount} file${rejectedCount === 1 ? '' : 's'} skipped${firstError ? `: ${firstError}` : '.'}`;
};

export const getUploadFileKey = (file: File): string =>
  [file.name, file.size, file.type, file.lastModified].join('::');

export const deduplicateUploadFiles = (files: File[]): File[] => {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = getUploadFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const isSupportedUploadFile = (file: File): boolean =>
  SUPPORTED_UPLOAD_TYPES.includes(getUploadContentType(file));

export const isResizableOversizedImage = (file: File): boolean =>
  isSupportedUploadFile(file) && isImageUploadFile(file) && file.size > MAX_UPLOAD_FILE_SIZE_BYTES;

export const getUploadValidationError = (file: File): string | null => {
  if (!isSupportedUploadFile(file)) {
    return 'Unsupported format. Choose JPG, PNG, or a supported video file.';
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  if (file.size > getMaxUploadSizeBytes(file)) {
    return isVideoUploadFile(file)
      ? `Video exceeds the ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB limit.`
      : `Image exceeds the ${MAX_UPLOAD_FILE_SIZE_MB} MB limit. Resize it before uploading.`;
  }
  return null;
};

export const prepareUploadSelection = (
  currentFiles: File[],
  incomingFiles: File[],
): { files: File[]; duplicateCount: number } => {
  const combined = [...currentFiles, ...incomingFiles];
  const deduplicated = deduplicateUploadFiles(combined);
  const duplicateCount = combined.length - deduplicated.length;
  return {
    files: deduplicated,
    duplicateCount,
  };
};
