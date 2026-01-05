import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
  width?: number | null;
  height?: number | null;
  objectFit?: 'cover' | 'contain';
  layout?: boolean | 'position' | 'size';
}

export const LazyImage = ({
  src,
  alt,
  className,
  imgClassName,
  style,
  width,
  height,
  objectFit = 'cover',
  layout,
}: LazyImageProps) => {
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
        rootMargin: '75px', // Start loading 75px before entering viewport
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
    <motion.div
      layout={layout}
      className={`relative flex items-center justify-center overflow-hidden ${className ?? ''}`}
      style={style}
      transition={{
        layout: { duration: 0.3, ease: 'easeInOut' },
      }}
    >
      {imageSrc ? (
        <motion.img
          layout={layout}
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${imgClassName ?? ''} ${isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
          onLoad={handleLoad}
          onError={handleError}
          transition={{
            layout: { duration: 0.3, ease: 'easeInOut' },
          }}
        />
      ) : (
        <motion.div
          layout={layout}
          ref={imgRef}
          className="w-full bg-surface-foreground dark:bg-surface animate-pulse flex items-center justify-center"
          style={{ aspectRatio }}
        >
          <div className="text-text-muted text-sm">Loading...</div>
        </motion.div>
      )}
      {isLoading && imageSrc && (
        <div className="absolute inset-0 bg-surface-foreground dark:bg-surface animate-pulse flex items-center justify-center">
          <div className="text-text-muted text-sm">Loading...</div>
        </div>
      )}
    </motion.div>
  );
};
