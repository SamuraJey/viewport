import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SharedFolderShare, SharedProjectShare } from '../../types/sharelink';
import type { PublicGalleryAppearance } from '../../types/sharelink';
import { toHeroObjectPosition } from './galleryAppearance';

interface PublicGalleryHeroProps {
  title: string;
  date?: string;
  photographer?: string;
  cover?: SharedFolderShare['cover'] | SharedProjectShare['cover'];
  appearance: PublicGalleryAppearance;
}

export const PublicGalleryHero = ({
  title,
  date,
  photographer,
  cover,
  appearance,
}: PublicGalleryHeroProps) => {
  const [isHeroFullLoaded, setIsHeroFullLoaded] = useState(false);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const heroUrl = cover?.full_url;
  const galleryTitle = title || 'Shared Gallery';
  const titleLength = galleryTitle.length;
  const objectPosition = toHeroObjectPosition(appearance);
  const displayOption = appearance.cover_display_option ?? 'centered_title';

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

  const textBlockTitleSizeClass =
    titleLength > 60
      ? 'text-xl sm:text-2xl md:text-3xl'
      : titleLength > 40
        ? 'text-2xl sm:text-3xl md:text-4xl'
        : 'text-3xl sm:text-4xl md:text-5xl';

  const minimalistTitleSizeClass =
    titleLength > 60
      ? 'text-lg sm:text-xl md:text-2xl'
      : titleLength > 40
        ? 'text-xl sm:text-2xl md:text-3xl'
        : 'text-2xl sm:text-3xl md:text-4xl';

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
      <div className="mb-8 rounded-3xl border border-border/50 bg-surface-1/70 px-6 py-24 text-center shadow-xs dark:bg-surface-dark-1/70">
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

  const renderHeroContent = () => {
    switch (displayOption) {
      case 'text_block':
        return (
          <div className="relative z-10 p-6 sm:p-8 w-full max-w-5xl mx-auto flex flex-col justify-end h-full pb-20 sm:pb-24">
            <div className="flex flex-col lg:flex-row lg:justify-start">
              <div className="rounded-2xl bg-black/60 backdrop-blur-md px-5 py-4 sm:px-7 sm:py-5 max-w-md">
                {date && (
                  <p className="text-xs sm:text-sm font-medium text-white/70 tracking-wider uppercase mb-2">
                    {date}
                  </p>
                )}
                <h1
                  className={`${textBlockTitleSizeClass} font-bold text-white drop-shadow-lg tracking-tight leading-tight wrap-break-word`}
                >
                  {galleryTitle}
                </h1>
                {photographer && (
                  <p className="mt-3 text-sm sm:text-base font-medium text-white/80 drop-shadow-md">
                    By {photographer}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 'minimalist':
        return (
          <div className="relative z-10 p-6 sm:p-8 w-full max-w-5xl mx-auto flex flex-col justify-end h-full pb-14 sm:pb-16">
            <h1
              className={`${minimalistTitleSizeClass} font-bold text-white drop-shadow-xl tracking-tight leading-tight wrap-break-word max-w-2xl`}
            >
              {galleryTitle}
            </h1>
            <div className="mt-2 flex items-center gap-3 text-xs sm:text-sm font-medium text-white/70 drop-shadow-md">
              {date && <span className="uppercase tracking-wider">{date}</span>}
              {photographer && (
                <>
                  {date && <span aria-hidden="true">·</span>}
                  <span>{photographer}</span>
                </>
              )}
            </div>
          </div>
        );

      default: // centered_title
        return (
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
        );
    }
  };

  return (
    <div className="pg-hero relative w-full text-accent-foreground bg-surface-foreground/15 dark:bg-surface/20 overflow-hidden shadow-md">
      <img
        src={cover.thumbnail_url}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition }}
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
        style={{ objectPosition }}
      />

      <div className="pg-hero__overlay bg-linear-to-t from-black/80 via-black/40 to-black/10" />

      {renderHeroContent()}

      {/* Animated scroll button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}
        >
          <a
            href="#gallery-content"
            aria-label="Scroll to photos"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/50 backdrop-blur-xs transition-all duration-300 hover:scale-110 hover:border-white hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            onClick={(event) => {
              event.preventDefault();
              const target = document.getElementById('gallery-content');
              if (target && typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ behavior: 'smooth' });
              }
              target?.focus();
            }}
          >
            <ChevronDown className="h-6 w-6 text-white" />
          </a>
        </div>
      </div>
    </div>
  );
};
