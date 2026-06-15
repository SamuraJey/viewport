import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';

export const supportedUploadTypes = ['image/jpeg', 'image/png', 'image/jpg'];

export const isFileTooLarge = (file: File): boolean => file.size > MAX_UPLOAD_FILE_SIZE_BYTES;

export const isFileTypeInvalid = (file: File): boolean => !supportedUploadTypes.includes(file.type);

/**
 * Returns true when the file can be resized: it is too large AND has a supported
 * image type (JPEG or PNG). Only resizable files get the Resize button in the UI.
 */
export const isResizableFile = (file: File): boolean =>
  isFileTooLarge(file) && supportedUploadTypes.includes(file.type);

export const hasFileUploadError = (file: File) => isFileTooLarge(file) || isFileTypeInvalid(file);

export const getFileUploadErrorText = (file: File) => {
  const tooLarge = isFileTooLarge(file);
  const invalidType = isFileTypeInvalid(file);

  if (tooLarge && invalidType) {
    return `⚠ File too large (max ${MAX_UPLOAD_FILE_SIZE_MB}MB) • Invalid format (JPG/PNG only)`;
  }

  if (tooLarge) {
    return `⚠ File too large (max ${MAX_UPLOAD_FILE_SIZE_MB}MB)`;
  }

  if (invalidType) {
    return 'Invalid format (JPG/PNG only)';
  }

  return null;
};
