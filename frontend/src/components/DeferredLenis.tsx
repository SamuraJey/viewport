import { useEffect, type ReactNode } from 'react';
import type Lenis from 'lenis';

/** Enhance landing-page scrolling without changing or remounting the React tree. */
export const DeferredLenis = ({ children }: { children?: ReactNode }) => {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (reducedMotion.matches || coarsePointer.matches || connection?.saveData) return;

    let cancelled = false;
    let instance: Lenis | undefined;
    const load = () => {
      void import('lenis')
        .then(({ default: Lenis }) => {
          if (!cancelled && !reducedMotion.matches && !coarsePointer.matches) {
            instance = new Lenis({ autoRaf: true });
          }
        })
        .catch(() => {
          // Native scrolling remains available if the optional enhancement cannot load.
        });
    };
    const stop = () => {
      cancelled = true;
      instance?.destroy();
      instance = undefined;
    };
    const onPreferenceChange = () => {
      if (reducedMotion.matches || coarsePointer.matches) stop();
    };
    reducedMotion.addEventListener('change', onPreferenceChange);
    coarsePointer.addEventListener('change', onPreferenceChange);
    const idleId = window.requestIdleCallback?.(load, { timeout: 1500 });
    const timeoutId = idleId === undefined ? window.setTimeout(load, 250) : undefined;
    return () => {
      stop();
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      coarsePointer.removeEventListener('change', onPreferenceChange);
    };
  }, []);

  return children ?? null;
};
