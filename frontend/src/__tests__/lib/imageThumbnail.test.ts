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
    vi.restoreAllMocks();
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
    it('evicts old compressed previews after the cache reaches its bound', async () => {
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockImplementation(async () => createMockBitmap(400, 267)),
      );
      const first = createMockFile('evicted.jpg', 100, 'image/jpeg');
      (await createImageThumbnail(first)).cleanup();
      for (let index = 0; index < 64; index++) {
        (
          await createImageThumbnail(createMockFile(`recent-${index}.jpg`, 100, 'image/jpeg'))
        ).cleanup();
      }
      expect(createImageBitmap).toHaveBeenCalledTimes(65);
      (await createImageThumbnail(first)).cleanup();
      expect(createImageBitmap).toHaveBeenCalledTimes(66);
    });

    it('creates a compressed preview without ImageBitmap support and releases the original URL', async () => {
      vi.stubGlobal('createImageBitmap', undefined);
      const file = createMockFile('legacy.jpg', 100, 'image/jpeg');
      const result = await createImageThumbnail(file);
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(URL.createObjectURL).toHaveBeenLastCalledWith(expect.any(Blob));
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      result.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('uses worker output without decoding on the main thread', async () => {
      vi.spyOn(window.location, 'toString').mockReturnValue('http://localhost:3000/');
      vi.resetModules();
      const instances: MockWorker[] = [];
      class MockWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onmessageerror: (() => void) | null = null;
        postMessage = vi.fn();
        terminate = vi.fn();
        constructor() {
          instances.push(this);
        }
      }
      vi.stubGlobal('Worker', MockWorker);
      vi.stubGlobal('OffscreenCanvas', class {});
      const thumbnailModule = await import('../../lib/imageThumbnail');
      const file = createMockFile('worker.jpg', 100, 'image/jpeg');
      const pending = thumbnailModule.createImageThumbnail(file);
      expect(instances).toHaveLength(1);
      expect(instances[0].postMessage).toHaveBeenCalledWith({ file, maxDimension: 400 });
      const blob = new Blob(['worker-preview'], { type: 'image/jpeg' });
      instances[0].onmessage!(new MessageEvent('message', { data: { blob } }));
      const result = await pending;
      expect(createImageBitmap).not.toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      result.cleanup();
    });

    it('falls back and releases a worker slot after a worker crashes', async () => {
      vi.spyOn(window.location, 'toString').mockReturnValue('http://localhost:3000/');
      vi.resetModules();
      let worker!: MockWorker;
      class MockWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onmessageerror: (() => void) | null = null;
        postMessage = vi.fn();
        terminate = vi.fn();
        constructor() {
          worker = this;
        }
      }
      vi.stubGlobal('Worker', MockWorker);
      vi.stubGlobal('OffscreenCanvas', class {});
      const thumbnailModule = await import('../../lib/imageThumbnail');
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockBitmap(400, 267)));
      const pending = thumbnailModule.createImageThumbnail(
        createMockFile('crash.jpg', 100, 'image/jpeg'),
      );
      worker.onerror!();
      const result = await pending;
      expect(worker.terminate).toHaveBeenCalled();
      expect(createImageBitmap).toHaveBeenCalledTimes(1);
      result.cleanup();
      const next = thumbnailModule.createImageThumbnail(
        createMockFile('next.jpg', 100, 'image/jpeg'),
      );
      worker.onmessage!(new MessageEvent('message', { data: { blob: new Blob(['recovered']) } }));
      (await next).cleanup();
    });

    it('bounds concurrent decodes and removes aborted queued work', async () => {
      const decodes: ((bitmap: ImageBitmap) => void)[] = [];
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(() => new Promise<ImageBitmap>((resolve) => decodes.push(resolve))),
      );
      const controller = new AbortController();
      const first = createImageThumbnail(createMockFile('first.jpg', 100, 'image/jpeg'));
      const second = createImageThumbnail(createMockFile('second.jpg', 100, 'image/jpeg'));
      const cancelled = createImageThumbnail(
        createMockFile('queued.jpg', 100, 'image/jpeg'),
        400,
        controller.signal,
      );
      expect(createImageBitmap).toHaveBeenCalledTimes(2);
      controller.abort();
      expect((await cancelled).url).toBeNull();
      decodes.forEach((resolve) => resolve(createMockBitmap(400, 267)));
      (await first).cleanup();
      (await second).cleanup();
      expect(createImageBitmap).toHaveBeenCalledTimes(2);
    });

    it('discards an active preview after cancellation without allocating a URL', async () => {
      let finish!: (bitmap: ImageBitmap) => void;
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(
          () =>
            new Promise<ImageBitmap>((resolve) => {
              finish = resolve;
            }),
        ),
      );
      const controller = new AbortController();
      const pending = createImageThumbnail(
        createMockFile('active.jpg', 100, 'image/jpeg'),
        400,
        controller.signal,
      );
      controller.abort();
      const bitmap = createMockBitmap(400, 267);
      finish(bitmap);
      expect((await pending).url).toBeNull();
      expect(bitmap.close).toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('reuses a compressed preview when a virtual row remounts, with independent URL lifetimes', async () => {
      const file = createMockFile('cached.jpg', 100, 'image/jpeg');
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockBitmap(400, 267)));
      const first = await createImageThumbnail(file);
      const second = await createImageThumbnail(file);
      expect(createImageBitmap).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
      first.cleanup();
      second.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('closes a decoded bitmap even when drawing fails', async () => {
      const bitmap = createMockBitmap(400, 267);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
      const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const result = await createImageThumbnail(
        createMockFile('no-context.jpg', 100, 'image/jpeg'),
      );
      expect(bitmap.close).toHaveBeenCalledTimes(1);
      result.cleanup();
      context.mockRestore();
    });

    it('preserves a landscape image aspect ratio while creating the thumbnail', async () => {
      const file = createMockFile('photo.jpg', 5 * 1024 * 1024, 'image/jpeg');
      const bitmap = createMockBitmap(400, 267);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

      const result: ThumbnailResult = await createImageThumbnail(file);

      expect(result.url).toBe('blob:mock-url');
      expect(createImageBitmap).toHaveBeenCalledWith(file, {
        resizeWidth: 400,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      expect(bitmap.close).toHaveBeenCalled();
      result.cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('preserves a portrait image aspect ratio and bounds its long edge', async () => {
      const file = createMockFile('portrait.jpg', 5 * 1024 * 1024, 'image/jpeg');
      const widthBoundBitmap = createMockBitmap(400, 600);
      const heightBoundBitmap = createMockBitmap(267, 400);
      const createBitmap = vi
        .fn()
        .mockResolvedValueOnce(widthBoundBitmap)
        .mockResolvedValueOnce(heightBoundBitmap);
      vi.stubGlobal('createImageBitmap', createBitmap);

      const result = await createImageThumbnail(file);

      expect(createBitmap).toHaveBeenNthCalledWith(1, file, {
        resizeWidth: 400,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      expect(createBitmap).toHaveBeenNthCalledWith(2, widthBoundBitmap, {
        resizeHeight: 400,
        resizeQuality: 'high',
      });
      expect(widthBoundBitmap.close).toHaveBeenCalled();
      expect(heightBoundBitmap.close).toHaveBeenCalled();
      result.cleanup();
    });

    it('recognizes a JPG by extension when MIME is absent', async () => {
      const file = createMockFile('photo.jpg', 1024, '');
      const bitmap = createMockBitmap(400, 267);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

      const result = await createImageThumbnail(file);

      expect(result.url).toBe('blob:mock-url');
      expect(createImageBitmap).toHaveBeenCalledWith(file, expect.any(Object));
      result.cleanup();
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
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      result.cleanup();
    });
  });
});
