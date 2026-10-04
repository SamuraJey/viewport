import { preloadRoute } from '../../lib/preloadRoute';
import { lazy, Suspense, useState } from 'react';
import type { LightboxExternalProps } from 'yet-another-react-lightbox';
import { OverlayLoading } from '../ui/OverlayLoading';
import { loadLightboxStyles } from './lightboxStyles';

const PhotoLightbox = lazy(async () => {
  const [module] = await Promise.all([
    preloadRoute('PhotoLightbox', () => import('./PhotoLightbox')),
    loadLightboxStyles(),
  ]);
  return module;
});

export const DeferredPhotoLightbox = (props: LightboxExternalProps) => {
  const [activated, setActivated] = useState(false);
  if (props.open && !activated) setActivated(true);
  // Keep the viewer mounted after its first use so exit callbacks still run.
  if (!activated) return null;
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
