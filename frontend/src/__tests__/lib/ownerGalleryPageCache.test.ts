import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerGalleryPageCache } from '../../lib/ownerGalleryPageCache';
import type { GalleryDetail } from '../../types/gallery';

const gallery = (overrides: Partial<GalleryDetail> = {}): GalleryDetail =>
  ({
    id: 'gallery',
    total_photos: 300,
    photos: [],
    ...overrides,
  }) as GalleryDetail;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('OwnerGalleryPageCache', () => {
  let cache: OwnerGalleryPageCache;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    cache?.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares an in-flight prefetch with a click and serves cached data', async () => {
    const pending = deferred<GalleryDetail>();
    const load = vi.fn().mockReturnValue(pending.promise);
    cache = new OwnerGalleryPageCache(load);
    cache.prefetchNext(1, 100, gallery());
    await vi.advanceTimersByTimeAsync(200);
    const click = cache.get(2);
    const data = gallery();
    pending.resolve(data);
    expect(await click).toBe(data);
    expect(await cache.get(2)).toBe(data);
    expect(load).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('expires pages after 30 seconds and bounds the LRU to three pages', async () => {
    const load = vi.fn().mockImplementation(async () => gallery());
    cache = new OwnerGalleryPageCache(load);
    for (const page of [1, 2, 3, 1, 4, 1, 2]) await cache.get(page);
    expect(load.mock.calls.map(([page]) => page)).toEqual([1, 2, 3, 4, 2]);
    await vi.advanceTimersByTimeAsync(30_001);
    await cache.get(2);
    expect(load).toHaveBeenCalledTimes(6);
  });

  it('does not repopulate the cache with a read started before invalidation', async () => {
    const pending = deferred<GalleryDetail>();
    const old = gallery({ name: 'old' });
    const current = gallery({ name: 'current' });
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(current);
    cache = new OwnerGalleryPageCache(load);
    const read = cache.get(1);
    cache.clear();
    expect(await cache.get(1)).toBe(current);
    pending.resolve(old);
    expect(await read).toBe(old);
    expect(await cache.get(1)).toBe(current);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([
    { photos: [{ status: 'processing' }] },
    { photos: [{ status: 'pending' }] },
    { photos: [{ rotation_status: 'pending' }] },
    { photos: [{ rotation_status: 'processing' }] },
    { pending_rotation_count: 1 },
  ])('always revalidates unfinished media: %j', async (partial) => {
    const data = gallery(partial as Partial<GalleryDetail>);
    const load = vi.fn().mockResolvedValue(data);
    cache = new OwnerGalleryPageCache(load);
    await cache.get(1);
    await cache.get(1);
    cache.prefetchNext(1, 100, data);
    await vi.advanceTimersByTimeAsync(1500);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('cancels scheduled prefetches and hides speculative failures', async () => {
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    cache = new OwnerGalleryPageCache(load);
    cache.prefetchNext(1, 100, gallery());
    cache.clear();
    await vi.advanceTimersByTimeAsync(500);
    expect(load).not.toHaveBeenCalled();
    cache.prefetchNext(1, 100, gallery());
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledExactlyOnceWith(2);
    await expect(cache.get(2)).rejects.toThrow('offline');
  });

  it('does not prefetch on a hidden page, the last page, or a constrained connection', async () => {
    const load = vi.fn().mockResolvedValue(gallery());
    cache = new OwnerGalleryPageCache(load);
    cache.prefetchNext(3, 100, gallery());
    await vi.advanceTimersByTimeAsync(500);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    cache.prefetchNext(1, 100, gallery());
    await vi.advanceTimersByTimeAsync(500);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    for (const connection of [{ saveData: true }, { effectiveType: '2g' }]) {
      vi.stubGlobal('navigator', { connection });
      cache.prefetchNext(1, 100, gallery());
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('warms only eight thumbnails with two decodes and releases them on invalidation', async () => {
    const images: {
      src: string;
      decode: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
    }[] = [];
    const decodes: ReturnType<typeof deferred<void>>[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decoding = '';
        fetchPriority = '';
        removeAttribute = vi.fn();
        decode = vi.fn(() => {
          const pending = deferred<void>();
          decodes.push(pending);
          return pending.promise;
        });
        constructor() {
          images.push(this);
        }
      },
    );
    const data = gallery({
      photos: Array.from({ length: 100 }, (_, index) => ({
        thumbnail_url: `thumb-${index}`,
        url: `original-${index}`,
      })) as GalleryDetail['photos'],
    });
    cache = new OwnerGalleryPageCache(vi.fn().mockResolvedValue(data));
    cache.prefetchNext(1, 100, gallery());
    await vi.advanceTimersByTimeAsync(200);
    expect(images).toHaveLength(2);
    for (let batch = 0; batch < 4; batch++) {
      decodes[batch * 2].resolve();
      decodes[batch * 2 + 1].resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(images).toHaveLength(8);
    expect(images.map((image) => image.src)).toEqual(
      Array.from({ length: 8 }, (_, i) => `thumb-${i}`),
    );
    cache.clear();
    expect(images.every((image) => image.removeAttribute.mock.calls[0][0] === 'src')).toBe(true);
  });
});
