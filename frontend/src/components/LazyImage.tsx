import { useState, useRef, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number | null;
  height?: number | null;
}

export const LazyImage = ({ src, alt, className, style, width, height }: LazyImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Calculate aspect ratio from provided dimensions
  const aspectRatio = width && height ? `${width}/${height}` : '4/3';

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
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.1,
      },
    );

    const currentImg = imgRef.current;
    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      if (currentImg) {
        observer.unobserve(currentImg);
      }
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
        className={`bg-red-100 text-red-500 text-sm p-4 flex items-center justify-center ${className}`}
        style={style}
      >
        Failed to load
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-auto object-cover ${isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
          style={{ aspectRatio }}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <div
          ref={imgRef}
          className="w-full bg-surface-foreground dark:bg-surface animate-pulse flex items-center justify-center"
          style={{ aspectRatio }}
        >
          <div className="text-text-muted text-sm">Loading...</div>
        </div>
      )}
      {isLoading && imageSrc && (
        <div className="absolute inset-0 bg-surface-foreground dark:bg-surface animate-pulse flex items-center justify-center">
          <div className="text-text-muted text-sm">Loading...</div>
        </div>
      )}
    </div>
  );
};
