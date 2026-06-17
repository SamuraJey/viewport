import imageCompression, { type Options } from 'browser-image-compression';
import { MAX_UPLOAD_FILE_SIZE_BYTES, SUPPORTED_IMAGE_TYPES } from '../constants/upload';

const SUPPORTED_RESIZE_TYPES = SUPPORTED_IMAGE_TYPES;

/**
 * Resizes an image file to fit within the specified byte limit.
 * Uses browser-image-compression with Web Worker for off-main-thread processing.
 *
 * Bundle note: browser-image-compression is ~25KB gzipped. Offsetting factors:
 * - Only loaded with the upload modal code path (Vite code splitting)
 * - Web Worker offloads Canvas processing from the main thread
 *
 * @param file - The image file to resize
 * @param maxBytes - Target maximum size in bytes (default: MAX_UPLOAD_FILE_SIZE_BYTES)
 * @param quality - Optional initial quality (0.1–1.0). Lower = more compression, faster resize.
 * @returns A Promise resolving to the resized File, or the original if already under limit
 * @throws Error if file type is unsupported for resize or compression fails
 */
export async function resizeImageForUpload(
  file: File,
  maxBytes: number = MAX_UPLOAD_FILE_SIZE_BYTES,
  quality?: number,
): Promise<File> {
  // Already under limit — no resize needed (includes non-image files that happen to be under limit)
  if (file.size <= maxBytes) return file;

  // Cannot resize non-image files
  if (!SUPPORTED_RESIZE_TYPES.includes(file.type)) {
    throw new Error(`Cannot resize file type: ${file.type || 'unknown'}`);
  }

  try {
    const options: Options = {
      maxSizeMB: maxBytes / (1024 * 1024),
      useWebWorker: true,
      maxWidthOrHeight: 4096,
    };
    if (quality !== undefined) {
      options.initialQuality = quality;
    }
    const compressed = await imageCompression(file, options);

    // Guard: ensure the result retains file identity
    return new File([compressed], file.name, {
      type: compressed.type || file.type,
    });
  } catch (err) {
    throw new Error(
      `Failed to resize image: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }
}
