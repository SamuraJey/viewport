import { useLayoutEffect, useState } from 'react';

export interface OverlayViewport {
  height: number;
  top: number;
  bottom: number;
  keyboardOpen: boolean;
}

// The layout viewport can remain behind the software keyboard (notably on iOS).
// Keep measurements local to each overlay so nested surfaces clean up independently.
export const useOverlayViewport = (open: boolean) => {
  const [viewport, setViewport] = useState<OverlayViewport>();

  useLayoutEffect(() => {
    if (!open || !window.visualViewport) return;
    const visualViewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      // Pinch zoom must remain browser-managed, rather than shrinking the UI again.
      if (visualViewport.scale !== 1) return;
      setViewport({
        height: visualViewport.height,
        top: visualViewport.offsetTop,
        bottom: Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop),
        keyboardOpen:
          document.activeElement instanceof HTMLElement &&
          document.activeElement.matches('input, textarea, select, [contenteditable="true"]') &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(max-width: 767px), (pointer: coarse)').matches,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    visualViewport.addEventListener('resize', schedule);
    visualViewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      visualViewport.removeEventListener('resize', schedule);
      visualViewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !viewport) return;
    const field = document.activeElement;
    if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select')) return;
    const scroller = field.closest<HTMLElement>('[data-overlay-scroll], [data-overlay-viewport]');
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const target = field.getBoundingClientRect();
    if (target.bottom > bounds.bottom - 12) {
      scroller.scrollTop += target.bottom - bounds.bottom + 12;
    } else if (target.top < bounds.top + 12) {
      scroller.scrollTop -= bounds.top - target.top + 12;
    }
  }, [open, viewport]);

  return viewport;
};
