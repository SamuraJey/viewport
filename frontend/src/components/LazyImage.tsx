import { useState, useRef, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
  aspectRatioHint?: number;
  width?: number | null;
  height?: number | null;
  objectFit?: 'cover' | 'contain';
  layout?: boolean | 'position' | 'size';
}

const DEFAULT_ASPECT_RATIO = '4/3';

function getValidAspectRatioHint(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return String(value);
}

export const LazyImage = ({
  src,
  alt,
  className,
  imgClassName,
  style,
  aspectRatioHint,
  width,
  height,
  objectFit = 'cover',
  layout,
}: LazyImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const aspectRatio =
    getValidAspectRatioHint(aspectRatioHint) ??
    (width && height ? `${width}/${height}` : DEFAULT_ASPECT_RATIO);
  const layoutTransitionClass = layout ? 'transition-all duration-300 ease-in-out' : '';

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !imageSrc) {
            setImageSrc(src);
            if (imgRef.current) {
              observer.unobserve(imgRef.current);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0,
      },
    );

    const currentImg = imgRef.current;
    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      observer.disconnect();
    };
  }, [src, imageSrc]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError(true);
  };

  if (error) {
    return (
      <div
        className={`bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 text-sm p-4 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-500/20 ${className}`}
        style={style}
      >
        Failed to load
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl ${layoutTransitionClass} ${className ?? ''}`}
      style={style}
    >
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`w-full h-full ${layoutTransitionClass} ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${imgClassName ?? ''} ${isLoading ? 'opacity-0 scale-105' : 'opacity-100 scale-100'} transition-all duration-500`}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <div
          ref={imgRef}
          className={`w-full bg-surface-1 dark:bg-surface-dark-1 animate-pulse flex items-center justify-center ${layoutTransitionClass}`}
          style={{ aspectRatio }}
        >
          <div className="text-muted text-sm font-medium">Loading...</div>
        </div>
      )}
      {isLoading && imageSrc && (
        <div className="absolute inset-0 bg-surface-1 dark:bg-surface-dark-1 animate-pulse flex items-center justify-center">
          <div className="text-muted text-sm font-medium">Loading...</div>
        </div>
      )}
    </div>
  );
};
