import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Check whether the user prefers reduced motion.
 * Reads once on mount and listens for changes.
 */
const usePrefersReducedMotion = (): boolean => {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
};

/**
 * Check whether Save-Data header is present.
 * Reads once on mount and listens for changes.
 */
const useSaveData = (): boolean => {
  const [saveData, setSaveData] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    return connection?.saveData === true;
  });

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;
    if (!connection || typeof connection.addEventListener !== 'function') return;
    const handler = () => setSaveData(Boolean(connection.saveData));
    connection.addEventListener('change', handler);
    return () => {
      if (typeof connection.removeEventListener !== 'function') return;
      connection.removeEventListener('change', handler);
    };
  }, []);

  return saveData;
};

export const PublicGalleryHero = ({
  title,
  date,
  photographer,
  cover,
  appearance,
}: PublicGalleryHeroProps) => {
  const [isHeroFullLoaded, setIsHeroFullLoaded] = useState(false);
  const [videoAutoplayFailed, setVideoAutoplayFailed] = useState(false);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const heroUrl = cover?.full_url;
  const galleryTitle = title || 'Shared Gallery';
  const titleLength = galleryTitle.length;
  const objectPosition = toHeroObjectPosition(appearance);
  const displayOption = appearance.cover_display_option ?? 'centered_title';
  const prefersReducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();

  const isVideo = cover?.media_type === 'video' && Boolean(cover?.playback_url);
  const shouldAutoplayVideo = isVideo && !prefersReducedMotion && !saveData && !videoAutoplayFailed;

  // Reset videoAutoplayFailed when the cover identity changes so a failed
  // autoplay only disables the current video and does not carry over.
  useEffect(() => {
    setVideoAutoplayFailed(false);
  }, [cover?.playback_url]);

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

  // For image covers: preload and track load state
  useLayoutEffect(() => {
    if (!heroUrl || isVideo) {
      setIsHeroFullLoaded(false);
      return;
    }

    if (heroImgRef.current?.complete && heroImgRef.current?.naturalWidth > 0) {
      setIsHeroFullLoaded(true);
    } else {
      setIsHeroFullLoaded(false);
    }
  }, [heroUrl, isVideo]);

  useEffect(() => {
    if (!heroUrl || isVideo) return;

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
  }, [heroUrl, isVideo]);

  // IntersectionObserver: pause video when out of viewport
  useEffect(() => {
    const video = heroVideoRef.current;
    const container = heroContainerRef.current;
    if (!video || !container || !shouldAutoplayVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              // Play may fail if still loading; no need to mark as failed
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldAutoplayVideo]);

  // Handle video autoplay error
  const handleVideoError = useCallback(() => {
    setVideoAutoplayFailed(true);
  }, []);

  // For video: poster is loaded (thumbnail shown), then video starts playing on top
  // We use the poster as the base, video fades in on successful play
  const handleVideoLoaded = useCallback(() => {
    setIsHeroFullLoaded(true);
  }, []);

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
    <div
      ref={heroContainerRef}
      className="pg-hero relative w-full text-accent-foreground bg-surface-foreground/15 overflow-hidden shadow-md"
    >
      {/* Thumbnail / poster layer — always visible as base */}
      <img
        src={cover.thumbnail_url}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition }}
      />

      {isVideo ? (
        <>
          {/* Video layer — fades in when autoplay succeeds */}
          {shouldAutoplayVideo && (
            <video
              ref={heroVideoRef}
              src={cover.playback_url!}
              poster={cover.thumbnail_url}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              onCanPlay={handleVideoLoaded}
              onError={handleVideoError}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isHeroFullLoaded && !videoAutoplayFailed ? 'opacity-100' : 'opacity-0'}`}
              style={{ objectPosition }}
            />
          )}
        </>
      ) : (
        /* Image layer — progressive full-res load */
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
      )}

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
