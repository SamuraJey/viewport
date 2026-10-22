import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ImageOff, VideoOff } from 'lucide-react';

interface OwnerPhotoThumbnailProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  index: number;
  isVideo: boolean;
  failed: boolean;
  transform?: string;
  fallbackTransform?: string;
  onNaturalSize?: (width: number, height: number) => void;
}

// Keyed by URL in the card: error/loading state cannot leak between page slots.
export const OwnerPhotoThumbnail = memo(function OwnerPhotoThumbnail({
  src,
  fallbackSrc,
  alt,
  index,
  isVideo,
  failed,
  transform,
  fallbackTransform,
  onNaturalSize,
}: OwnerPhotoThumbnailProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isUsingFallback = !isVideo && (failed || !src || useFallback);
  const imageSrc = isUsingFallback ? fallbackSrc : failed ? undefined : src;
  const unavailable = hasError || !imageSrc;
  const imageTransform = isUsingFallback ? fallbackTransform : transform;
  const handleError = useCallback(() => {
    if (!isVideo && fallbackSrc && imageSrc !== fallbackSrc) setUseFallback(true);
    else setHasError(true);
  }, [isVideo, fallbackSrc, imageSrc]);
  // Successful loads affect only native image/CSS state, avoiding 100 React updates.
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) {
      image.setAttribute('data-loaded', 'true');
      onNaturalSize?.(image.naturalWidth, image.naturalHeight);
    } else handleError();
  }, [imageSrc, handleError, onNaturalSize]);
  return (
    <>
      {unavailable ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-linear-to-br from-surface-1 via-surface to-surface-1/80 p-6 text-center dark:from-surface-dark-2 dark:via-surface-dark-1 dark:to-surface-dark-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-surface/80 text-muted shadow-inner dark:border-border/40 dark:bg-surface-dark-2/80">
            {isVideo ? <VideoOff className="h-6 w-6" /> : <ImageOff className="h-6 w-6" />}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">Preview unavailable</p>
            <p className="text-xs font-medium text-muted">Tap to open original</p>
          </div>
        </div>
      ) : (
        <img
          key={imageSrc}
          ref={imageRef}
          src={imageSrc}
          alt={alt}
          className="owner-photo-preview h-full w-full object-contain opacity-0 data-[loaded=true]:opacity-100 transition-opacity duration-150 motion-reduce:transition-none"
          style={imageTransform ? { transform: imageTransform } : undefined}
          loading="lazy"
          decoding="async"
          fetchPriority={index < 4 ? 'high' : 'auto'}
          onLoad={(event) => {
            event.currentTarget.setAttribute('data-loaded', 'true');
            onNaturalSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
          }}
          onError={handleError}
        />
      )}
      {!unavailable && (
        <div className="owner-photo-placeholder absolute inset-0 flex flex-col items-center justify-center gap-4 bg-linear-to-br from-surface-1/95 via-surface/95 to-surface-1/95 px-5 dark:from-surface-dark-2/95 dark:via-surface-dark-1/95 dark:to-surface-dark-2/95">
          <div className="h-28 w-full max-w-48 animate-pulse rounded-2xl bg-surface-foreground/15 dark:bg-surface/25" />
          <div className="h-2.5 w-24 animate-pulse rounded-full bg-surface-foreground/20 dark:bg-surface/30" />
        </div>
      )}
    </>
  );
});
