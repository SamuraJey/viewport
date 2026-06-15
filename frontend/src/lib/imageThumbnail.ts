export interface ThumbnailResult {
  url: string | null;
  cleanup: () => void;
}

const DEFAULT_MAX_DIMENSION = 400;

/**
 * Create a small thumbnail preview for an image file without decoding the full
 * resolution pixel buffer. Uses createImageBitmap with resize options so the
 * browser decodes directly to thumbnail dimensions.
 *
 * Returns a blob: URL and a cleanup function. For non-image files the URL is
 * null and cleanup is a no-op. On failure (unsupported browser, corrupt file,
 * etc.) falls back to URL.createObjectURL(file) so previews still work.
 */
export async function createImageThumbnail(
  file: File,
  maxDimension: number = DEFAULT_MAX_DIMENSION,
): Promise<ThumbnailResult> {
  if (!file.type.startsWith('image/')) {
    return { url: null, cleanup: () => {} };
  }

  let fallbackUrl: string | null = null;

  try {
    const bitmap = await createImageBitmap(file, {
      resizeWidth: maxDimension,
      resizeHeight: maxDimension,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('Could not get 2d canvas context');
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });

    if (!blob) {
      throw new Error('Canvas toBlob returned null');
    }

    const url = URL.createObjectURL(blob);
    return { url, cleanup: () => URL.revokeObjectURL(url) };
  } catch {
    fallbackUrl = URL.createObjectURL(file);
    return { url: fallbackUrl, cleanup: () => URL.revokeObjectURL(fallbackUrl!) };
  }
}
