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

const getTitleSizeClass = (
  titleLength: number,
  classPrefix: string,
  thresholds: { medium: number; long: number },
): string => {
  const size =
    titleLength > thresholds.long ? 'long' : titleLength > thresholds.medium ? 'medium' : 'short';
  return `${classPrefix}--${size}`;
};

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

  const emptyTitleSizeClass = getTitleSizeClass(titleLength, 'pg-hero__empty-title', {
    medium: 46,
    long: 80,
  });
  const heroTitleSizeClass = getTitleSizeClass(titleLength, 'pg-hero__centered-title', {
    medium: 60,
    long: 90,
  });

  const textBlockTitleSizeClass = getTitleSizeClass(titleLength, 'pg-hero__text-block-title', {
    medium: 40,
    long: 60,
  });

  const minimalistTitleSizeClass = getTitleSizeClass(titleLength, 'pg-hero__minimalist-title', {
    medium: 40,
    long: 60,
  });

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
      <div className="mb-8 rounded-3xl border border-border/50 bg-surface-1/70 px-6 py-24 text-center shadow-xs">
        <h1
          className={`pg-hero__empty-title ${emptyTitleSizeClass} mb-4 font-bold text-text wrap-break-word`}
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
          <div className="pg-hero__content pg-hero__content--text-block relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col justify-end">
            <div className="flex flex-col justify-start">
              <div className="pg-hero__text-block max-w-md rounded-2xl bg-black/60 backdrop-blur-md">
                {date && (
                  <p className="pg-hero__date mb-2 font-medium uppercase tracking-wider text-white/70">
                    {date}
                  </p>
                )}
                <h1
                  className={`pg-hero__text-block-title ${textBlockTitleSizeClass} font-bold text-white drop-shadow-lg wrap-break-word`}
                >
                  {galleryTitle}
                </h1>
                {photographer && (
                  <p className="pg-hero__photographer mt-3 font-medium text-white/80 drop-shadow-md">
                    By {photographer}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 'minimalist':
        return (
          <div className="pg-hero__content pg-hero__content--minimalist relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col justify-end">
            <h1
              className={`pg-hero__minimalist-title ${minimalistTitleSizeClass} max-w-2xl font-bold text-white drop-shadow-xl wrap-break-word`}
            >
              {galleryTitle}
            </h1>
            <div className="pg-hero__meta-row mt-2 flex items-center gap-3 font-medium text-white/70 drop-shadow-md">
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
          <div className="pg-hero__content pg-hero__content--centered relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col justify-end">
            <div className="flex flex-col items-center text-center">
              {date && (
                <p className="pg-hero__date mb-3 font-medium uppercase tracking-wider text-white/80">
                  {date}
                </p>
              )}
              <h1
                className={`pg-hero__centered-title ${heroTitleSizeClass} max-w-full font-bold text-white drop-shadow-xl wrap-break-word`}
              >
                {galleryTitle}
              </h1>
              <div className="pg-hero__byline mt-4 font-medium text-white/90 drop-shadow-md">
                {photographer && <span>By {photographer}</span>}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="pg-hero relative w-full text-accent-foreground bg-surface-foreground/15 overflow-hidden shadow-md">
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
