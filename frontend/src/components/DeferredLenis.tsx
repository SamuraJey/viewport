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
    const timeoutId = window.setTimeout(() => {
      void import('lenis/react').then((module) => {
        setLenisComponent(() => module.ReactLenis);
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!LenisComponent) {
    return <>{children}</>;
  }

  return <LenisComponent root>{children}</LenisComponent>;
};
