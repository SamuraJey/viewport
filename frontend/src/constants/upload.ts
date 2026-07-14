export const MAX_UPLOAD_FILE_SIZE_MB = 10;
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const MAX_VIDEO_UPLOAD_FILE_SIZE_MB = 500;
export const MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES = MAX_VIDEO_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
export const VIDEO_PART_SIZE = 16 * 1024 * 1024; // 16 MiB
export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
  'video/mpeg',
  'video/3gpp',
];
export const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
  '.mpeg',
  '.mpg',
  '.3gp',
];
export const SUPPORTED_UPLOAD_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES];

/** Return the maximum upload size in bytes for a given file based on its type. */
export const getMaxUploadSizeBytes = (file: { type: string }): number =>
  file.type.startsWith('video/') ? MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES : MAX_UPLOAD_FILE_SIZE_BYTES;
