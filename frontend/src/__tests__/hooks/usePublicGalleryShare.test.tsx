import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePublicGalleryShare } from '../../hooks/usePublicGalleryShare';

const payload = {
  title: 'View Summer Portraits on Viewport',
  text: 'Open Summer Portraits, shared with you through Viewport.',
  url: 'https://viewport.test/share/share-1',
};

const setNavigatorShare = (share?: Navigator['share']) => {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: share,
  });
};

describe('usePublicGalleryShare', () => {
  afterEach(() => {
    setNavigatorShare(undefined);
    vi.restoreAllMocks();
  });

  it('detects support, passes the canonical payload, and closes after success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(share);
    const { result } = renderHook(() => usePublicGalleryShare(payload));

    await waitFor(() => expect(result.current.isNativeShareSupported).toBe(true));
    act(() => result.current.openShareDrawer());
    expect(result.current.isShareDrawerOpen).toBe(true);

    await act(() => result.current.shareViaDevice());

    expect(share).toHaveBeenCalledWith(payload);
    expect(result.current.isShareDrawerOpen).toBe(false);
    expect(result.current.nativeShareError).toBe('');
  });

  it('treats AbortError as cancellation and leaves the drawer open', async () => {
    setNavigatorShare(vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')));
    const { result } = renderHook(() => usePublicGalleryShare(payload));

    act(() => result.current.openShareDrawer());
    await act(() => result.current.shareViaDevice());

    expect(result.current.isShareDrawerOpen).toBe(true);
    expect(result.current.nativeShareError).toBe('');
  });

  it('keeps the drawer open and exposes a recoverable error for other failures', async () => {
    setNavigatorShare(vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError')));
    const { result } = renderHook(() => usePublicGalleryShare(payload));

    act(() => result.current.openShareDrawer());
    await act(() => result.current.shareViaDevice());

    expect(result.current.isShareDrawerOpen).toBe(true);
    expect(result.current.nativeShareError).toBe(
      "Couldn't open device sharing. Try Copy link instead.",
    );
  });

  it('reports unsupported browsers without attempting to share', async () => {
    setNavigatorShare(undefined);
    const { result } = renderHook(() => usePublicGalleryShare(payload));

    await waitFor(() => expect(result.current.isNativeShareSupported).toBe(false));
    act(() => result.current.openShareDrawer());
    await act(() => result.current.shareViaDevice());

    expect(result.current.isShareDrawerOpen).toBe(true);
    expect(result.current.nativeShareError).toBe('');
  });
});
