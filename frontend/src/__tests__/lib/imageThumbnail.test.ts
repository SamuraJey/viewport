import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createImageThumbnail, type ThumbnailResult } from '../../lib/imageThumbnail';

function createMockFile(name: string, size: number, type: string): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 1024))], { type });
  const file = new File([blob], name, { type });
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

function createMockBitmap(width: number, height: number): ImageBitmap & { close: () => void } {
  return {
    width,
    height,
    close: vi.fn(),
    // Minimal stub for other ImageBitmap properties we don't touch
    colorSpace: 'srgb',
  } as unknown as ImageBitmap & { close: () => void };
}

describe('createImageThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('createImageBitmap', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('non-image files', () => {
    it('returns a null url and no-op cleanup', async () => {
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      const result = await createImageThumbnail(file);

      expect(result.url).toBeNull();
      expect(createImageBitmap).not.toHaveBeenCalled();
      expect(() => result.cleanup()).not.toThrow();
    });
  });

  describe('image files', () => {
    it('creates a thumbnail blob url and a cleanup that revokes it', async () => {
      const file = createMockFile('photo.jpg', 5 * 1024 * 1024, 'image/jpeg');
      const bitmap = createMockBitmap(400, 267);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

      const result: ThumbnailResult = await createImageThumbnail(file);

      expect(result.url).toBe('blob:mock-url');
      expect(createImageBitmap).toHaveBeenCalledWith(file, {
        resizeWidth: 400,
        resizeHeight: 400,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      expect(bitmap.close).toHaveBeenCalled();
      result.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('falls back to a full-file blob url when createImageBitmap rejects', async () => {
      const file = createMockFile('corrupt.jpg', 1024, 'image/jpeg');
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockRejectedValue(new DOMException('Invalid image')),
      );

      const result = await createImageThumbnail(file);

      expect(result.url).toBe('blob:mock-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      result.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('falls back to a full-file blob url when canvas.toBlob returns null', async () => {
      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');
      const bitmap = createMockBitmap(400, 267);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
      const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
        cb(null);
      });

      const result = await createImageThumbnail(file);

      expect(result.url).toBe('blob:mock-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      result.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

      toBlobSpy.mockRestore();
    });

    it('passes a custom maxDimension through to createImageBitmap', async () => {
      const file = createMockFile('photo.jpg', 5 * 1024 * 1024, 'image/jpeg');
      const bitmap = createMockBitmap(200, 133);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

      const result = await createImageThumbnail(file, 200);

      expect(result.url).toBe('blob:mock-url');
      expect(createImageBitmap).toHaveBeenCalledWith(file, {
        resizeWidth: 200,
        resizeHeight: 200,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      result.cleanup();
    });
  });
});
