import type { Accept } from 'react-dropzone';
import {
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
  SUPPORTED_UPLOAD_TYPES,
  getMaxUploadSizeBytes,
  getUploadContentType,
  isVideoUploadFile,
} from '../../constants/upload';

export const MAX_UPLOAD_FILES = 200;
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

export const getUploadValidationError = (file: File): string | null => {
  if (!isSupportedUploadFile(file)) {
    return 'Unsupported format. Choose JPG, PNG, or a supported video file.';
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  if (file.size > getMaxUploadSizeBytes(file)) {
    return isVideoUploadFile(file)
      ? 'Video exceeds the 500 MB limit.'
      : 'Image exceeds the 10 MB limit. Resize it before uploading.';
  }
  return null;
};

export const prepareUploadSelection = (
  currentFiles: File[],
  incomingFiles: File[],
): { files: File[]; duplicateCount: number; overflowCount: number } => {
  const combined = [...currentFiles, ...incomingFiles];
  const deduplicated = deduplicateUploadFiles(combined);
  const duplicateCount = combined.length - deduplicated.length;
  const overflowCount = Math.max(0, deduplicated.length - MAX_UPLOAD_FILES);
  return {
    files: deduplicated.slice(0, MAX_UPLOAD_FILES),
    duplicateCount,
    overflowCount,
  };
};
