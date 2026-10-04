import { describe, expect, it } from 'vitest';
import { loadStylesheet } from '../../../components/lightbox/lightboxStyles';

describe('lazy photo viewer styles', () => {
  it('deduplicates concurrent loads and waits for stylesheet readiness', async () => {
    const first = loadStylesheet('/viewer-test.css');
    expect(loadStylesheet('/viewer-test.css')).toBe(first);
    const link = document.querySelector<HTMLLinkElement>('link[href="/viewer-test.css"]')!;
    expect(link.rel).toBe('stylesheet');
    link.dispatchEvent(new Event('load'));
    await first;
    expect(document.querySelectorAll('link[href="/viewer-test.css"]')).toHaveLength(1);
    link.remove();
  });
  it('removes failed requests and permits retry', async () => {
    const failed = loadStylesheet('/failed-viewer-test.css');
    const outcome = failed.catch((error: unknown) => error);
    document
      .querySelector('link[href="/failed-viewer-test.css"]')!
      .dispatchEvent(new Event('error'));
    expect(await outcome).toEqual(new Error('Could not load photo viewer styles'));
    expect(document.querySelector('link[href="/failed-viewer-test.css"]')).toBeNull();
    const retry = loadStylesheet('/failed-viewer-test.css');
    const link = document.querySelector('link[href="/failed-viewer-test.css"]')!;
    link.dispatchEvent(new Event('load'));
    await retry;
    link.remove();
  });
});
