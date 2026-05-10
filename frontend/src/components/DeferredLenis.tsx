import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

type LenisWrapperProps = {
  children: ReactNode;
  root?: boolean;
};

export const DeferredLenis = ({ children }: { children: ReactNode }) => {
  const [LenisComponent, setLenisComponent] = useState<ComponentType<LenisWrapperProps> | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    const timeoutId = window.setTimeout(() => {
      void import('lenis/react')
        .then((module) => {
          if (isMounted) {
            setLenisComponent(() => module.ReactLenis);
          }
        })
        .catch(() => {
          // Smooth scrolling is progressive enhancement; keep native scrolling on load failure.
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!LenisComponent) {
    return <>{children}</>;
  }

  return <LenisComponent root>{children}</LenisComponent>;
};
