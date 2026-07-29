import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetScrollForBreadcrumbNavigation } from '../../../components/share-link-detail/utils';

describe('resetScrollForBreadcrumbNavigation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.style.scrollBehavior = '';
  });

  it('preserves the initial scroll behavior across overlapping resets', () => {
    vi.useFakeTimers();
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    document.documentElement.style.scrollBehavior = 'smooth';

    resetScrollForBreadcrumbNavigation();
    resetScrollForBreadcrumbNavigation();
    vi.runAllTimers();

    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
