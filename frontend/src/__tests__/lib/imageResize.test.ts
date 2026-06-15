import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resizeImageForUpload } from '../../lib/imageResize';
import imageCompression from 'browser-image-compression';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../../constants/upload';

vi.mock('browser-image-compression');

const mockedImageCompression = vi.mocked(imageCompression);

function createMockFile(name: string, size: number, type: string): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 1024))], { type });
  const file = new File([blob], name, { type });
  // Override size since Blob-based File may not match
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

describe('resizeImageForUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('files under the size limit', () => {
    it('returns the original file unchanged when file.size <= maxBytes', async () => {
      const file = createMockFile('small.jpg', 5 * 1024 * 1024, 'image/jpeg');

      const result = await resizeImageForUpload(file);

      expect(result).toBe(file);
      expect(mockedImageCompression).not.toHaveBeenCalled();
    });

    it('returns a non-image file unchanged when under limit', async () => {
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      const result = await resizeImageForUpload(file);

      expect(result).toBe(file);
      expect(mockedImageCompression).not.toHaveBeenCalled();
    });
  });

  describe('oversized image files', () => {
    it('compresses an oversized JPEG and returns a file under the limit', async () => {
      const file = createMockFile('large.jpg', 15 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('large.jpg', 8 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      const result = await resizeImageForUpload(file);

      expect(result).not.toBe(file);
      expect(result.size).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE_BYTES);
      expect(mockedImageCompression).toHaveBeenCalledWith(file, {
        maxSizeMB: 10,
        useWebWorker: true,
        maxWidthOrHeight: 4096,
      });
    });

    it('compresses an oversized PNG and returns a file under the limit', async () => {
      const file = createMockFile('large.png', 20 * 1024 * 1024, 'image/png');
      const compressedFile = createMockFile('large.png', 9 * 1024 * 1024, 'image/png');
      mockedImageCompression.mockResolvedValue(compressedFile);

      const result = await resizeImageForUpload(file);

      expect(result).not.toBe(file);
      expect(result.size).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE_BYTES);
      expect(mockedImageCompression).toHaveBeenCalledWith(file, {
        maxSizeMB: 10,
        useWebWorker: true,
        maxWidthOrHeight: 4096,
      });
    });
  });

  describe('file identity preservation', () => {
    it('preserves the original file name after compression', async () => {
      const file = createMockFile('vacation-photo.jpg', 12 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('temp.jpg', 5 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      const result = await resizeImageForUpload(file);

      expect(result.name).toBe('vacation-photo.jpg');
    });

    it('preserves the original file type after compression', async () => {
      const file = createMockFile('photo.jpg', 12 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('photo.jpg', 5 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      const result = await resizeImageForUpload(file);

      expect(result.type).toBe('image/jpeg');
    });

    it('falls back to original file type when compressed type is empty', async () => {
      const file = createMockFile('photo.jpg', 12 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('photo.jpg', 5 * 1024 * 1024, '');
      mockedImageCompression.mockResolvedValue(compressedFile);

      const result = await resizeImageForUpload(file);

      expect(result.type).toBe('image/jpeg');
    });
  });

  describe('unsupported file types', () => {
    it('throws for oversized non-image files', async () => {
      const file = createMockFile('doc.pdf', 15 * 1024 * 1024, 'application/pdf');

      await expect(resizeImageForUpload(file)).rejects.toThrow('Cannot resize file type');
    });

    it('throws for oversized files with unknown MIME type', async () => {
      const file = createMockFile('binary.bin', 15 * 1024 * 1024, '');

      await expect(resizeImageForUpload(file)).rejects.toThrow('Cannot resize file type');
    });
  });

  describe('compression failures', () => {
    it('throws a user-friendly error when compression fails', async () => {
      const file = createMockFile('corrupt.jpg', 12 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockRejectedValue(new Error('Canvas error'));

      await expect(resizeImageForUpload(file)).rejects.toThrow('Failed to resize image');
    });
  });

  describe('default maxBytes', () => {
    it('uses MAX_UPLOAD_FILE_SIZE_BYTES as default target', async () => {
      const file = createMockFile('photo.jpg', 12 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('photo.jpg', 9 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      await resizeImageForUpload(file);

      expect(mockedImageCompression).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          maxSizeMB: MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024),
        }),
      );
    });
  });

  describe('quality parameter', () => {
    it('passes initialQuality to imageCompression when quality is provided', async () => {
      const file = createMockFile('large.jpg', 15 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('large.jpg', 8 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      await resizeImageForUpload(file, MAX_UPLOAD_FILE_SIZE_BYTES, 0.5);

      expect(mockedImageCompression).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          maxSizeMB: 10,
          useWebWorker: true,
          maxWidthOrHeight: 4096,
          initialQuality: 0.5,
        }),
      );
    });

    it('does not pass initialQuality when quality is omitted', async () => {
      const file = createMockFile('large.jpg', 15 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('large.jpg', 8 * 1024 * 1024, 'image/jpeg');
      mockedImageCompression.mockResolvedValue(compressedFile);

      await resizeImageForUpload(file);

      const callOptions = mockedImageCompression.mock.calls[0][1];
      expect(callOptions).not.toHaveProperty('initialQuality');
    });
  });
});
