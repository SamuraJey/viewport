import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';

export const supportedUploadTypes = ['image/jpeg', 'image/png', 'image/jpg'];

export const isFileTooLarge = (file: File) => file.size > MAX_UPLOAD_FILE_SIZE_BYTES;

export const isFileTypeInvalid = (file: File) => !supportedUploadTypes.includes(file.type);

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
