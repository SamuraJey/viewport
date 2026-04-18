import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SharedFolderShare, SharedProjectShare } from '../../types/sharelink';

interface PublicGalleryHeroProps {
  title: string;
  date?: string;
  photographer?: string;
  cover?: SharedFolderShare['cover'] | SharedProjectShare['cover'];
}

export const PublicGalleryHero = ({ title, date, photographer, cover }: PublicGalleryHeroProps) => {
  const [isHeroFullLoaded, setIsHeroFullLoaded] = useState(false);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const heroUrl = cover?.full_url;
  const galleryTitle = title || 'Shared Gallery';
  const titleLength = galleryTitle.length;
  const emptyTitleSizeClass =
    titleLength > 80
      ? 'text-2xl sm:text-3xl'
      : titleLength > 46
        ? 'text-3xl sm:text-4xl'
        : 'text-4xl sm:text-5xl';
  const heroTitleSizeClass =
    titleLength > 90
      ? 'text-2xl sm:text-4xl md:text-5xl'
      : titleLength > 60
        ? 'text-3xl sm:text-5xl md:text-6xl'
        : 'text-4xl sm:text-6xl md:text-7xl';

  useLayoutEffect(() => {
    if (!heroUrl) {
      setIsHeroFullLoaded(false);
      return;
    }

    if (heroImgRef.current?.complete && heroImgRef.current?.naturalWidth > 0) {
      setIsHeroFullLoaded(true);
    } else {
      setIsHeroFullLoaded(false);
    }
  }, [heroUrl]);

  useEffect(() => {
    if (!heroUrl) return;

    const preload = new Image();
    preload.src = heroUrl;

    if (preload.complete && preload.naturalWidth > 0) {
      setIsHeroFullLoaded(true);
      return;
    }

    const handlePreload = () => {
      setIsHeroFullLoaded(true);
    };

    preload.addEventListener('load', handlePreload, { once: true });

    return () => {
      preload.removeEventListener('load', handlePreload);
    };
  }, [heroUrl]);

  if (!cover) {
    return (
      <div className="text-center py-24 px-6 bg-surface-foreground/5 dark:bg-surface-1/30 rounded-3xl border border-border/50 shadow-xs mb-8">
        <h1
          className={`${emptyTitleSizeClass} mb-4 font-bold tracking-tight text-text wrap-break-word`}
        >
          {galleryTitle}
        </h1>
        {photographer && (
          <p className="text-lg font-medium text-muted sm:text-xl">By {photographer}</p>
        )}
      </div>
    );
  }

  return (
    <div className="pg-hero relative w-full text-accent-foreground bg-surface-foreground/15 dark:bg-surface/20 overflow-hidden shadow-md">
      <img
        src={cover.thumbnail_url}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <img
        ref={heroImgRef}
        src={cover.full_url}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onLoad={() => setIsHeroFullLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isHeroFullLoaded ? 'opacity-100' : 'opacity-0'}`}
      />

      <div className="pg-hero__overlay bg-linear-to-t from-black/80 via-black/40 to-black/10" />

      {/* Animated text content with parallax */}
      <div className="relative z-10 p-8 w-full max-w-5xl mx-auto flex flex-col justify-end h-full pb-24">
        <div className="flex flex-col items-center text-center">
          {date && (
            <p className="text-sm sm:text-base font-medium text-white/80 tracking-wider uppercase mb-3">
              {date}
            </p>
          )}
          <h1
            className={`${heroTitleSizeClass} font-bold text-white drop-shadow-xl tracking-tight leading-tight wrap-break-word max-w-full`}
          >
            {galleryTitle}
          </h1>
          <div className="mt-4 sm:mt-6 text-lg sm:text-xl font-medium text-white/90 drop-shadow-md">
            {photographer && <span>By {photographer}</span>}
          </div>
        </div>
      </div>

      {/* Animated scroll button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}
        >
          <a
            href="#gallery-content"
            aria-label="Scroll to photos"
            className="w-12 h-12 border-2 border-white/50 rounded-full flex items-center justify-center hover:bg-white/20 hover:border-white hover:scale-110 transition-all duration-300 backdrop-blur-xs"
            onClick={(event) => {
              event.preventDefault();
              const target = document.getElementById('gallery-content');
              if (target && typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ behavior: 'smooth' });
              }
              target?.focus();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-6 h-6 text-white"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};
