import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'viewport:public-photo-ratios:v1';

describe('photoAspectRatioCache', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it('writes valid ratios to memory and sessionStorage', async () => {
    const cache = await import('../../lib/photoAspectRatioCache');

    expect(cache.getCachedPhotoAspectRatio('photo-1')).toBeUndefined();
    expect(cache.setCachedPhotoAspectRatio('photo-1', 1.5)).toBe(true);
    expect(cache.getCachedPhotoAspectRatio('photo-1')).toBe(1.5);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      'photo-1': 1.5,
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
});
