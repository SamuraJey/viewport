import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverlayViewport } from '../../hooks/useOverlayViewport';

afterEach(() => vi.unstubAllGlobals());

describe('useOverlayViewport', () => {
  it('tracks keyboard resize and viewport panning, ignores pinch zoom, and unsubscribes', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', viewport);
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const { result, rerender } = renderHook(({ open }) => useOverlayViewport(open), {
      initialProps: { open: true },
    });
    expect(result.current?.height).toBe(700);

    const change = async (type: string) => {
      await act(async () => {
        viewport.dispatchEvent(new Event(type));
        await new Promise(requestAnimationFrame);
      });
    };
    viewport.height = 320;
    await change('resize');
    expect(result.current).toEqual({
      height: 320,
      top: 0,
      bottom: window.innerHeight - 320,
      keyboardOpen: false,
    });
    viewport.offsetTop = 40;
    await change('scroll');
    expect(result.current?.top).toBe(40);
    expect(result.current?.bottom).toBe(window.innerHeight - 360);
    viewport.scale = 2;
    viewport.height = 160;
    await change('resize');
    expect(result.current?.height).toBe(320);
    viewport.scale = 1;
    viewport.height = 700;
    viewport.offsetTop = 0;
    await change('resize');
    expect(result.current?.height).toBe(700);
    rerender({ open: false });
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('leaves CSS viewport fallback in place when VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(() => useOverlayViewport(true));
    expect(result.current).toBeUndefined();
  });
});
