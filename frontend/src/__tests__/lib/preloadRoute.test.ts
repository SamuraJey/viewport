import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadRoute } from '../../lib/preloadRoute';

afterEach(() => {
  document
    .querySelectorAll(
      '#viewport-module-preloads, link[data-test-preload], link[href="/assets/selected.js"]',
    )
    .forEach((element) => element.remove());
});

describe('route preload hints', () => {
  it('preloads only the selected route and deduplicates shared imports', async () => {
    const manifest = document.createElement('script');
    manifest.id = 'viewport-module-preloads';
    manifest.type = 'application/json';
    manifest.textContent = JSON.stringify({
      files: ['/assets/selected.js', '/assets/other.js'],
      routes: { selected: [0], other: [1] },
    });
    document.head.append(manifest);
    const load = vi.fn().mockResolvedValue('module');
    expect(await preloadRoute('selected', load)).toBe('module');
    await preloadRoute('selected', load);
    expect(document.querySelectorAll('link[href="/assets/selected.js"]')).toHaveLength(1);
    expect(document.querySelector('link[href="/assets/other.js"]')).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('loads normally without production hints or when hints are invalid', async () => {
    const load = vi.fn().mockResolvedValue('module');
    expect(await preloadRoute('missing', load)).toBe('module');
    const manifest = document.createElement('script');
    manifest.id = 'viewport-module-preloads';
    manifest.type = 'application/json';
    manifest.textContent = 'invalid JSON';
    document.head.append(manifest);
    expect(await preloadRoute('missing', load)).toBe('module');
  });
});
