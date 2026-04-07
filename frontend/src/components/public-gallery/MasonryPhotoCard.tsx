import { useEffect, useRef, useState } from 'react';

interface MasonryPhotoCardProps {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}

export const MasonryPhotoCard = ({ src, alt, width, height }: MasonryPhotoCardProps) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setImageSrc(src);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: '600px',
        threshold: 0,
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [src]);

  return (
    <div
      ref={cardRef}
      className="pg-card__media relative w-full h-full overflow-hidden rounded-xl"
      style={{ aspectRatio: width && height ? `${width}/${height}` : '4/3' }}
    >
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-surface-1 dark:bg-surface-dark-1" />
      )}

      {imageSrc && !hasError && (
        <img
          src={imageSrc}
          alt={alt}
          className={`pg-card__img absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
          loading="lazy"
          decoding="async"
        />
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-500 text-sm dark:bg-red-500/10 dark:text-red-400">
          Failed to load
        </div>
      )}
    </div>
  );
};
