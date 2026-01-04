import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type TouchEvent as ReactTouchEvent,
  type TouchList as ReactTouchList,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  Download as DownloadIcon,
  Loader2,
  ImageOff,
  AlertCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { LazyImage } from '../components/LazyImage';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import {
  shareLinkService,
  type PublicPhoto,
  type SharedGallery,
} from '../services/shareLinkService';

// Get API base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const PublicGalleryPage = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [gallery, setGallery] = useState<SharedGallery | null>(null);
  const [photos, setPhotos] = useState<PublicPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string>('');
  const [gridDensity, setGridDensity] = useState<'large' | 'compact'>('large');
  const [gridLayout, setGridLayout] = useState<'masonry' | 'uniform'>('masonry');
  const { theme } = useTheme();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const computeSpansDebounceRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  // Pagination settings
  const PHOTOS_PER_PAGE = 100;

  // Load more photos callback (will be used by lightbox hook)
  const loadMorePhotosRef = useRef<(() => void) | undefined>(undefined);

  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '.pg-card',
    gridRef,
    onLoadMore: () => loadMorePhotosRef.current?.(),
    hasMore,
    isLoadingMore,
    loadMoreThreshold: 10,
  });

  const fetchGalleryData = useCallback(async () => {
    if (!shareId) {
      setError('Invalid share link');
      setIsLoading(false);
      return;
    }

    try {
      // Fetch gallery metadata and first batch of photos
      const data = await shareLinkService.getSharedGallery(shareId, {
        limit: PHOTOS_PER_PAGE,
        offset: 0,
      });

      setGallery(data);
      setPhotos(data.photos || []);

      // Check if there are more photos to load
      setHasMore(data.photos.length === PHOTOS_PER_PAGE);

      // After gallery is set, schedule masonry spans computation
      if (gridLayout === 'masonry') {
        requestAnimationFrame(() => {
          if (computeSpansDebounceRef.current)
            window.clearTimeout(computeSpansDebounceRef.current);
          computeSpansDebounceRef.current = window.setTimeout(() => computeSpans(), 100);
        });
      }
    } catch (err) {
      console.error('Failed to fetch shared gallery:', err);
      setError('Gallery not found or link has expired');
    } finally {
      setIsLoading(false);
    }
  }, [shareId, PHOTOS_PER_PAGE]);

  const loadMorePhotos = useCallback(async () => {
    if (isLoadingMore || !hasMore || !shareId) return;

    setIsLoadingMore(true);
    try {
      const currentOffset = photos.length;
      const moreData = await shareLinkService.getSharedGallery(shareId, {
        limit: PHOTOS_PER_PAGE,
        offset: currentOffset,
      });

      const newPhotos = moreData.photos || [];
      setPhotos((prev) => [...prev, ...newPhotos]);

      // Check if there are more photos to load
      setHasMore(newPhotos.length === PHOTOS_PER_PAGE);

      // Recompute masonry layout after loading new photos
      if (gridLayout === 'masonry') {
        requestAnimationFrame(() => {
          if (computeSpansDebounceRef.current)
            window.clearTimeout(computeSpansDebounceRef.current);
          computeSpansDebounceRef.current = window.setTimeout(() => computeSpans(), 100);
        });
      }
    } catch (err) {
      console.error('Failed to load more photos:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [shareId, photos.length, isLoadingMore, hasMore, PHOTOS_PER_PAGE, gridLayout]);

  // Update ref when loadMorePhotos changes
  useEffect(() => {
    loadMorePhotosRef.current = loadMorePhotos;
  }, [loadMorePhotos]);

  useEffect(() => {
    fetchGalleryData();
  }, [fetchGalleryData]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMorePhotos();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '400px',
      },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, loadMorePhotos]);

  // Masonry span computation
  const computeSpans = () => {
    if (gridLayout !== 'masonry') return;
    const grid = gridRef.current;
    if (!grid) return;
    const cs = getComputedStyle(grid);
    const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap = parseFloat(cs.getPropertyValue('gap')) || 20;
    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((item) => {
      const el = item as HTMLElement;
      const height = el.getBoundingClientRect().height;
      const span = Math.ceil((height + rowGap) / (rowHeight + rowGap));
      el.style.gridRowEnd = `span ${span}`;
    });
  };

  // Observe resize to reflow masonry
  useEffect(() => {
    if (gridLayout !== 'masonry') return undefined;
    const grid = gridRef.current;
    if (!grid) return undefined;
    const schedule = () => {
      if (computeSpansDebounceRef.current) window.clearTimeout(computeSpansDebounceRef.current);
      computeSpansDebounceRef.current = window.setTimeout(() => computeSpans(), 80);
    };
    const ro = new ResizeObserver(() => schedule());
    // observe the grid itself and images inside so we recalc when content changes
    ro.observe(grid);
    grid.querySelectorAll('img').forEach((img) => ro.observe(img));
    return () => {
      ro.disconnect();
      if (computeSpansDebounceRef.current) {
        window.clearTimeout(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [photos, gridLayout]);

  // Recompute masonry when grid density changes
  useEffect(() => {
    if (gridLayout !== 'masonry') return;
    requestAnimationFrame(() => {
      if (computeSpansDebounceRef.current) window.clearTimeout(computeSpansDebounceRef.current);
      computeSpansDebounceRef.current = window.setTimeout(() => computeSpans(), 80);
    });
  }, [gridDensity, photos.length, gridLayout]);

  // When switching into masonry, compute spans immediately (pre-paint) to avoid overlap flash
  useLayoutEffect(() => {
    if (gridLayout !== 'masonry') return;
    computeSpans();
    requestAnimationFrame(() => {
      if (computeSpansDebounceRef.current) window.clearTimeout(computeSpansDebounceRef.current);
      computeSpansDebounceRef.current = window.setTimeout(() => computeSpans(), 60);
    });
  }, [gridLayout, photos.length]);

  const clearGridRowSpans = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    Array.from(grid.children).forEach((item) => {
      (item as HTMLElement).style.gridRowEnd = '';
    });
  }, []);

  // Clear inline spans when leaving masonry so uniform grid uses natural flow
  useEffect(() => {
    if (gridLayout === 'masonry') return;
    clearGridRowSpans();
  }, [gridLayout, photos.length, clearGridRowSpans]);

  const setGridMode = useCallback((mode: 'large' | 'compact') => {
    setGridDensity((prev) => (prev === mode ? prev : mode));
  }, []);

  const setLayoutMode = useCallback(
    (mode: 'masonry' | 'uniform') => {
      setGridLayout((prev) => {
        if (prev === mode) return prev;
        if (mode === 'uniform') {
          clearGridRowSpans(); // avoid transient overlap while spans linger
        }
        return mode;
      });
    },
    [clearGridRowSpans],
  );

  const calculateTouchDistance = (touches: ReactTouchList) => {
    if (touches.length < 2) return 0;
    const first = touches.item(0);
    const second = touches.item(1);
    if (!first || !second) return 0;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const handleTouchStart = (event: ReactTouchEvent) => {
    if (window.innerWidth > 900) return;
    if (event.touches.length === 2) {
      event.preventDefault();
      pinchStartDistanceRef.current = calculateTouchDistance(event.touches);
      pinchHandledRef.current = false;
    }
  };

  const handleTouchMove = (event: ReactTouchEvent) => {
    if (window.innerWidth > 900) return;
    if (event.touches.length < 2 || pinchStartDistanceRef.current === null) return;

    // Block browser zoom on mobile so pinch exclusively switches grid density
    event.preventDefault();

    const currentDistance = calculateTouchDistance(event.touches);
    const delta = currentDistance - pinchStartDistanceRef.current;
    const threshold = 32;

    if (!pinchHandledRef.current && Math.abs(delta) > threshold) {
      setGridMode(delta < 0 ? 'compact' : 'large');
      pinchHandledRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistanceRef.current = null;
    pinchHandledRef.current = false;
  };

  const handleDownloadAll = () => {
    if (!shareId) return;
    window.open(`${API_BASE_URL}/s/${shareId}/download/all`, '_blank');
  };

  // Open lightbox at specific photo index
  const openPhoto = (index: number) => {
    openLightbox(index);
  };

  // Prepare slides for lightbox
  const lightboxSlides = photos.map((photo) => ({
    src: photo.full_url,
    width: photo.width || undefined,
    height: photo.height || undefined,
    alt: photo.filename || `Photo ${photo.photo_id}`,
    download: photo.full_url,
    downloadFilename: photo.filename || `photo-${photo.photo_id}.jpg`,
  }));

  const gridClassNames = [
    'pg-grid',
    gridLayout === 'masonry'
      ? gridDensity === 'compact'
        ? 'pg-grid--compact'
        : 'pg-grid--large'
      : gridDensity === 'compact'
        ? 'pg-grid-uniform--compact'
        : 'pg-grid-uniform--large',
    'pg-gesture-surface',
  ].join(' ');

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-surface dark:bg-surface-foreground/5"
        data-testid="skeleton-loader"
      >
        {/* Skeleton Hero */}
        <div className="h-screen bg-surface-foreground/10 dark:bg-surface/10 animate-pulse flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="h-4 w-32 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
            <div className="h-12 w-80 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
            <div className="h-4 w-48 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
          </div>
        </div>
        {/* Skeleton Grid */}
        <div className="w-full px-4 sm:px-6 lg:px-10 py-16">
          <div className="bg-surface-foreground/5 rounded-2xl p-6 border border-border">
            <div className="h-8 w-40 bg-surface-foreground/20 dark:bg-surface/20 rounded mb-6 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-4/3 bg-surface-foreground/10 dark:bg-surface/10 rounded-xl animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface dark:bg-surface-foreground/5">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-text dark:text-accent-foreground mb-2">
                Gallery Not Available
              </h1>
              <p className="text-muted dark:text-text">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-surface dark:bg-surface-foreground/5 ${theme === 'dark' ? 'text-accent-foreground' : 'text-text'}`}
    >
      {/* Theme switch button */}
      <div className="fixed top-6 right-6 z-30">
        <ThemeSwitch />
      </div>
      {/* Hero Section */}
      {gallery?.cover ? (
        <div className="pg-hero relative w-full text-accent-foreground">
          {/* Background Image */}
          <img
            src={gallery.cover.full_url}
            alt="Gallery cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Overlay */}
          <div className="pg-hero__overlay" />

          {/* Centered Content */}
          <div className="relative z-10 p-6">
            {gallery.date && <p className="text-sm pg-hero__meta mb-2">{gallery.date}</p>}
            <h1 className="pg-hero__title font-bold drop-shadow-lg">
              {gallery.gallery_name || 'Shared Gallery'}
            </h1>
            <div className="mt-4 text-lg pg-hero__meta">
              {gallery.photographer && <span>{gallery.photographer}</span>}
              {gallery.photographer && gallery.site_url && <span className="mx-2">|</span>}
              {gallery.site_url && (
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-accent-foreground"
                  href={gallery.site_url}
                >
                  {new URL(gallery.site_url).host}
                </a>
              )}
            </div>
          </div>

          {/* Scroll Down Arrow */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <a
              href="#gallery-content"
              aria-label="Scroll to photos"
              className="w-10 h-10 border-2 border-white/70 rounded-full flex items-center justify-center animate-pulse hover:bg-white/20 transition-colors duration-200"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('gallery-content')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-5 h-5"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        // Fallback for no cover photo
        <div className="text-center py-16">
          <h1 className="text-4xl font-bold text-text dark:text-accent-foreground mb-2">
            {gallery?.gallery_name || 'Shared Gallery'}
          </h1>
          {gallery?.photographer && (
            <p className="text-muted dark:text-text text-lg">By {gallery.photographer}</p>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div id="gallery-content" className="w-full px-4 sm:px-6 lg:px-10 py-16">
        {/* Gallery Actions */}
        {photos.length > 0 && (
          <div className="mb-8 text-center">
            <button
              onClick={handleDownloadAll}
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 rounded-lg font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 inline-flex items-center gap-2"
            >
              <DownloadIcon className="w-5 h-5" />
              Download All Photos
            </button>
          </div>
        )}

        {/* Photos Grid */}
        <div
          className="bg-surface-foreground/5 rounded-2xl p-6 border border-border"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{ touchAction: 'pan-y' }}
        >
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-semibold text-text dark:text-accent-foreground">
              Photos ({gallery?.total_photos ?? photos.length})
            </h2>

            <div className="hidden md:flex items-center gap-4" aria-label="Grid controls">
              <div className="flex items-center gap-2" aria-label="Layout controls">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Layout
                </span>
                <div className="inline-flex rounded-lg border border-border overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('masonry')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${gridLayout === 'masonry' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80 hover:bg-surface-foreground/40'}`}
                    aria-pressed={gridLayout === 'masonry'}
                  >
                    Masonry
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('uniform')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors border-l border-border ${gridLayout === 'uniform' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80 hover:bg-surface-foreground/40'}`}
                    aria-pressed={gridLayout === 'uniform'}
                  >
                    Uniform
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2" aria-label="Grid density controls">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Grid size
                </span>
                <div className="inline-flex rounded-lg border border-border overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setGridMode('large')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${gridDensity === 'large' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80 hover:bg-surface-foreground/40'}`}
                    aria-pressed={gridDensity === 'large'}
                  >
                    <Maximize2 className="w-4 h-4" />
                    Large
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridMode('compact')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors border-l border-border ${gridDensity === 'compact' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80 hover:bg-surface-foreground/40'}`}
                    aria-pressed={gridDensity === 'compact'}
                  >
                    <Minimize2 className="w-4 h-4" />
                    Compact
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="md:hidden text-xs text-muted mb-4">
            Pinch with two fingers to switch grid size. Use the controls below to change layout.
          </div>

          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4" aria-label="Mobile grid controls">
            <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Layout</span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLayoutMode('masonry')}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${gridLayout === 'masonry' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80'}`}
                  aria-pressed={gridLayout === 'masonry'}
                >
                  Masonry
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('uniform')}
                  className={`px-2.5 py-1.5 text-xs border-l border-border transition-colors ${gridLayout === 'uniform' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80'}`}
                  aria-pressed={gridLayout === 'uniform'}
                >
                  Uniform
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Grid size</span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGridMode('large')}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${gridDensity === 'large' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80'}`}
                  aria-pressed={gridDensity === 'large'}
                >
                  Large
                </button>
                <button
                  type="button"
                  onClick={() => setGridMode('compact')}
                  className={`px-2.5 py-1.5 text-xs border-l border-border transition-colors ${gridDensity === 'compact' ? 'bg-accent text-accent-foreground' : 'bg-transparent text-text/80 dark:text-accent-foreground/80'}`}
                  aria-pressed={gridDensity === 'compact'}
                >
                  Compact
                </button>
              </div>
            </div>
          </div>

          {photos.length > 0 ? (
            <>
              <div className={gridClassNames} ref={gridRef}>
                {photos.map((photo, index) => (
                  <div
                    key={photo.photo_id}
                    className={`pg-card pg-card-animate relative group ${gridLayout === 'uniform' ? 'pg-card--uniform' : ''}`}
                    style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                    data-testid="public-batch"
                  >
                    <button
                      onClick={() => openPhoto(index)}
                      className="w-full p-0 border-0 bg-transparent cursor-pointer block"
                      aria-label={`Photo ${photo.photo_id}`}
                    >
                      <div className={`pg-card__media ${gridLayout === 'uniform' ? 'pg-card__media--uniform' : ''}`}>
                        <LazyImage
                          src={photo.thumbnail_url}
                          alt={`Photo ${photo.photo_id}`}
                          className="pg-card__img"
                          imgClassName="pg-card__img"
                          objectFit={gridLayout === 'uniform' ? 'contain' : 'cover'}
                          width={photo.width}
                          height={photo.height}
                        />
                      </div>
                    </button>
                  </div>
                ))}
              </div>

              {/* Infinite scroll sentinel and loading indicator */}
              <div ref={observerTarget} className="h-4 mt-4" />

              {isLoadingMore && (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <span className="ml-2 text-muted">Loading more photos...</span>
                </div>
              )}

              {!hasMore && photos.length > PHOTOS_PER_PAGE && (
                <div className="text-center py-8 text-muted text-sm">
                  All photos loaded ({photos.length} total)
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-border dark:border-border/10 rounded-lg">
              <ImageOff className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-4 text-lg font-medium text-muted dark:text-muted-foreground">
                No photos in this gallery
              </h3>
              <p className="mt-2 text-sm text-muted">This gallery appears to be empty.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-muted dark:text-text text-sm">
          <p>Powered by Viewport - Your Photo Gallery Solution</p>
        </div>
      </div>

      {/* Lightbox */}
      {renderLightbox(lightboxSlides, photos.length)}
    </div>
  );
};
