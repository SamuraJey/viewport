import { useEffect, type ReactNode } from 'react';
import type Lenis from 'lenis';

export const DeferredLenis = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    let isMounted = true;
    let instance: Lenis | undefined;

    const timeoutId = window.setTimeout(() => {
      void import('lenis')
        .then((module) => {
          if (isMounted) {
            instance = new module.default({ autoRaf: true });
          }
        })
        .catch(() => {
          // Smooth scrolling is progressive enhancement; keep native scrolling on load failure.
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      instance?.destroy();
    };
  }, []);

  // Keep the React tree stable when the optional scroll controller arrives.
  return <>{children}</>;
};
