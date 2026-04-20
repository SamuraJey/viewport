import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'viewport:public-photo-ratios:v1';
const MAX_CACHE_ENTRIES = 3000;

describe('photoAspectRatioCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('debounces writes before persisting to sessionStorage', async () => {
    const cache = await import('../../lib/photoAspectRatioCache');

    expect(cache.getCachedPhotoAspectRatio('photo-1')).toBeUndefined();
    expect(cache.setCachedPhotoAspectRatio('photo-1', 1.5)).toBe(true);
    expect(cache.setCachedPhotoAspectRatio('photo-2', 2)).toBe(true);
    expect(cache.getCachedPhotoAspectRatio('photo-1')).toBe(1.5);
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      'photo-1': 1.5,
      'photo-2': 2,
    });
  });

  it('hydrates valid ratios and cleans invalid persisted values', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        valid: 1.25,
        zero: 0,
        absurd: 99,
        text: 'not-a-number',
      }),
    );

    const cache = await import('../../lib/photoAspectRatioCache');

    expect(cache.getCachedPhotoAspectRatio('valid')).toBe(1.25);
    expect(cache.getCachedPhotoAspectRatio('zero')).toBeUndefined();
    expect(cache.getCachedPhotoAspectRatio('absurd')).toBeUndefined();
    expect(cache.getCachedPhotoAspectRatio('text')).toBeUndefined();

    vi.runAllTimers();

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      valid: 1.25,
    });
  });

  it('ignores invalid ratio writes', async () => {
    const cache = await import('../../lib/photoAspectRatioCache');

    expect(cache.setCachedPhotoAspectRatio('photo-1', 0)).toBe(false);
    expect(cache.setCachedPhotoAspectRatio('photo-2', Number.NaN)).toBe(false);
    expect(cache.setCachedPhotoAspectRatio('photo-3', 999)).toBe(false);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('evicts the oldest cached ratios when the cache grows past the limit', async () => {
    const cache = await import('../../lib/photoAspectRatioCache');

    for (let index = 0; index < MAX_CACHE_ENTRIES + 5; index += 1) {
      expect(cache.setCachedPhotoAspectRatio(`photo-${index}`, 1 + index / 1000)).toBe(true);
    }

    vi.runAllTimers();

    const persisted = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(Object.keys(persisted)).toHaveLength(MAX_CACHE_ENTRIES);
    expect(cache.getCachedPhotoAspectRatio('photo-0')).toBeUndefined();
    expect(cache.getCachedPhotoAspectRatio(`photo-${MAX_CACHE_ENTRIES + 4}`)).toBeCloseTo(
      1 + (MAX_CACHE_ENTRIES + 4) / 1000,
    );
  });
});
