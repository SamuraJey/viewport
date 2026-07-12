import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_TYPES,
} from '../../constants/upload';

const supportedUploadTypes = SUPPORTED_UPLOAD_TYPES;

export const isFileTooLarge = (file: File): boolean => {
  if (file.type.startsWith('video/')) {
    return file.size > MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES;
  }
  return file.size > MAX_UPLOAD_FILE_SIZE_BYTES;
};

export const isFileTypeInvalid = (file: File): boolean => !supportedUploadTypes.includes(file.type);

/**
 * Returns true when the file can be resized: it is too large AND has a supported
 * image type (JPEG or PNG). Only resizable files get the Resize button in the UI.
 */
export const isResizableFile = (file: File): boolean =>
  file.type.startsWith('image/') && file.size > MAX_UPLOAD_FILE_SIZE_BYTES;

export const hasFileUploadError = (file: File) => isFileTooLarge(file) || isFileTypeInvalid(file);

export const getFileUploadErrorText = (file: File) => {
  const tooLarge = isFileTooLarge(file);
  const invalidType = isFileTypeInvalid(file);
  const maxSize = file.type.startsWith('video/')
    ? `${MAX_VIDEO_UPLOAD_FILE_SIZE_MB}MB`
    : `${MAX_UPLOAD_FILE_SIZE_MB}MB`;

  if (tooLarge && invalidType) {
    return `⚠ File too large (max ${maxSize}) • Invalid format`;
  }

  if (tooLarge) {
    return `⚠ File too large (max ${maxSize})`;
  }

  if (invalidType) {
    return 'Invalid format (JPG/PNG/supported video only)';
  }

  return null;
};
