export const supportedUploadTypes = ['image/jpeg', 'image/png', 'image/jpg'];

export const isFileTooLarge = (file: File) => file.size > 10 * 1024 * 1024;

export const isFileTypeInvalid = (file: File) => !supportedUploadTypes.includes(file.type);

export const hasFileUploadError = (file: File) => isFileTooLarge(file) || isFileTypeInvalid(file);

export const getFileUploadErrorText = (file: File) => {
  const tooLarge = isFileTooLarge(file);
  const invalidType = isFileTypeInvalid(file);

  if (tooLarge && invalidType) {
    return '⚠ File too large (max 10MB) • Invalid format (JPG/PNG only)';
  }

  if (tooLarge) {
    return '⚠ File too large (max 10MB)';
  }

  if (invalidType) {
    return 'Invalid format (JPG/PNG only)';
  }

  return null;
};
