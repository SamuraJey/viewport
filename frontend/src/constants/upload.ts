export const MAX_UPLOAD_FILE_SIZE_MB = 10;
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
export const MAX_CONCURRENT_FILE_UPLOADS = 4;
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

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
};

const getFileExtension = (filename: string): string => {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
};

/** Resolve a backend-supported content type when the browser omits File.type. */
export const getUploadContentType = (file: { name: string; type: string }): string =>
  SUPPORTED_UPLOAD_TYPES.includes(file.type)
    ? file.type
    : (CONTENT_TYPE_BY_EXTENSION[getFileExtension(file.name)] ?? file.type);

export const isVideoUploadFile = (file: { name: string; type: string }): boolean =>
  getUploadContentType(file).startsWith('video/');

export const isImageUploadFile = (file: { name: string; type: string }): boolean =>
  getUploadContentType(file).startsWith('image/');

/** Return the maximum upload size in bytes using MIME type with extension fallback. */
export const getMaxUploadSizeBytes = (file: { name: string; type: string }): number =>
  isVideoUploadFile(file) ? MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES : MAX_UPLOAD_FILE_SIZE_BYTES;
