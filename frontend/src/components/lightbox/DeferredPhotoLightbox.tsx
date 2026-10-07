import { preloadRoute } from '../../lib/preloadRoute';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { LightboxExternalProps } from 'yet-another-react-lightbox';
import { OverlayLoading } from '../ui/OverlayLoading';
import { loadLightboxStyles } from './lightboxStyles';

// React caches lazy rejections. Recoverable stylesheet requests must stay outside this loader.
const PhotoLightbox = lazy(() => preloadRoute('PhotoLightbox', () => import('./PhotoLightbox')));

export const DeferredPhotoLightbox = (props: LightboxExternalProps) => {
  const [activated, setActivated] = useState(false);
  const [stylesReady, setStylesReady] = useState(false);
  const [stylesFailed, setStylesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (props.open && !activated) setActivated(true);
  if (!props.open && stylesFailed) setStylesFailed(false);

  useEffect(() => {
    if (!props.open || stylesReady) return;
    // Fetch JS alongside CSS without putting stylesheet failures into React.lazy's cache.
    void preloadRoute('PhotoLightbox', () => Promise.resolve());
    let cancelled = false;
    void loadLightboxStyles().then(
      () => {
        if (!cancelled) setStylesReady(true);
      },
      () => {
        if (!cancelled) setStylesFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.open, stylesReady, attempt]);

  // Keep the viewer mounted after its first successful use so exit callbacks still run.
  if (!activated) return null;
  if (!stylesReady) {
    if (props.open && stylesFailed) {
      return (
        <div className="fixed bottom-6 left-1/2 z-100 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border bg-surface p-4 text-text shadow-xl dark:bg-surface-dark">
          <p role="alert" className="text-sm">
            Could not load photo viewer styles. Please try again.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => {
                setStylesFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry photo viewer
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => props.close?.()}
            >
              Close photo viewer
            </button>
          </div>
        </div>
      );
    }
    return (
      <OverlayLoading
        open={Boolean(props.open)}
        onClose={() => props.close?.()}
        label="Loading photo viewer"
      />
    );
  }
  return (
    <Suspense
      fallback={
        <OverlayLoading
          open={Boolean(props.open)}
          onClose={() => props.close?.()}
          label="Loading photo viewer"
        />
      }
    >
      <PhotoLightbox {...props} />
    </Suspense>
  );
};
