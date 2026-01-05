import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  startTransition,
  type TouchEvent as ReactTouchEvent,
  type TouchList as ReactTouchList,
} from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  const previousGridLayoutRef = useRef(gridLayout);
  const isSwitchingLayoutType = previousGridLayoutRef.current !== gridLayout;

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

  // Masonry span computation
  const computeSpans = useCallback(() => {
    if (gridLayout !== 'masonry') return;
    const grid = gridRef.current;
    if (!grid) return;

    const cs = getComputedStyle(grid);
    const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap = parseFloat(cs.getPropertyValue('gap')) || 20;

    // Use a more stable way to calculate spans that doesn't depend on current animated height.
    // We calculate the target height based on the column width and the photo's aspect ratio.
    const gridWidth = grid.offsetWidth;
    const gridColStyle = cs.getPropertyValue('grid-template-columns');
    // Resolved grid-template-columns usually looks like "400px 400px"
    const numCols = gridColStyle.split(' ').filter((s) => s.trim() !== '').length || 1;
    const colWidth = (gridWidth - (numCols - 1) * rowGap) / numCols;

    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((item, index) => {
      const photo = photos[index];
      if (!photo) return;

      // Use provided dimensions or fallback to 4:3
      const w = photo.width || 4;
      const h = photo.height || 3;
      const ratio = w / h;

      const targetHeight = colWidth / ratio;
      const span = Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap));
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    });
  }, [gridLayout, photos]);

  useEffect(() => {
    previousGridLayoutRef.current = gridLayout;
  }, [gridLayout]);

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
    } catch (err) {
      console.error('Failed to load more photos:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [shareId, photos.length, isLoadingMore, hasMore, PHOTOS_PER_PAGE]);

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

  // Observe resize to reflow masonry
  useEffect(() => {
    if (gridLayout !== 'masonry') return undefined;
    const grid = gridRef.current;
    if (!grid) return undefined;
    const schedule = () => {
      if (computeSpansDebounceRef.current) cancelAnimationFrame(computeSpansDebounceRef.current);
      computeSpansDebounceRef.current = requestAnimationFrame(() => computeSpans());
    };
    const ro = new ResizeObserver(() => schedule());
    // We compute spans from aspect ratios, so observing images is unnecessary/expensive.
    ro.observe(grid);
    return () => {
      ro.disconnect();
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [photos, gridLayout, computeSpans]);

  // Recompute masonry spans, but defer to rAF to keep INP low.
  useEffect(() => {
    if (gridLayout !== 'masonry') return;
    if (computeSpansDebounceRef.current) cancelAnimationFrame(computeSpansDebounceRef.current);
    computeSpansDebounceRef.current = requestAnimationFrame(() => computeSpans());
    return () => {
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [gridLayout, gridDensity, photos.length, computeSpans]);

  const clearGridRowSpans = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    Array.from(grid.children).forEach((item) => {
      (item as HTMLElement).style.gridRowEnd = '';
    });
  }, []);

  // Clear inline spans when leaving masonry so uniform grid uses natural flow
  useLayoutEffect(() => {
    if (gridLayout === 'masonry') return;
    clearGridRowSpans();
  }, [gridLayout, photos.length, clearGridRowSpans]);

  // Compute spans immediately when switching to masonry
  useLayoutEffect(() => {
    if (gridLayout !== 'masonry') return;
    computeSpans();
  }, [gridLayout, photos, computeSpans]);

  const setGridMode = useCallback((mode: 'large' | 'compact') => {
    startTransition(() => {
      setGridDensity((prev) => (prev === mode ? prev : mode));
    });
  }, []);

  const setLayoutMode = useCallback((mode: 'masonry' | 'uniform') => {
    startTransition(() => {
      setGridLayout((prev) => {
        if (prev === mode) return prev;
        return mode;
      });
    });
  }, []);

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
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownloadAll}
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200 inline-flex items-center gap-2"
            >
              <DownloadIcon className="w-5 h-5" />
              Download All Photos
            </motion.button>
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
                    className="relative flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    aria-pressed={gridLayout === 'masonry'}
                  >
                    {gridLayout === 'masonry' && (
                      <motion.div
                        layoutId="layout-active"
                        className="absolute inset-0 bg-accent"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span
                      className={`relative z-10 ${gridLayout === 'masonry' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    >
                      Masonry
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('uniform')}
                    className="relative flex items-center gap-2 px-3 py-2 text-sm transition-colors border-l border-border"
                    aria-pressed={gridLayout === 'uniform'}
                  >
                    {gridLayout === 'uniform' && (
                      <motion.div
                        layoutId="layout-active"
                        className="absolute inset-0 bg-accent"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span
                      className={`relative z-10 ${gridLayout === 'uniform' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    >
                      Uniform
                    </span>
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
                    className="relative flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    aria-pressed={gridDensity === 'large'}
                  >
                    {gridDensity === 'large' && (
                      <motion.div
                        layoutId="density-active"
                        className="absolute inset-0 bg-accent"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <Maximize2
                      className={`relative z-10 w-4 h-4 ${gridDensity === 'large' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    />
                    <span
                      className={`relative z-10 ${gridDensity === 'large' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    >
                      Large
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridMode('compact')}
                    className="relative flex items-center gap-2 px-3 py-2 text-sm transition-colors border-l border-border"
                    aria-pressed={gridDensity === 'compact'}
                  >
                    {gridDensity === 'compact' && (
                      <motion.div
                        layoutId="density-active"
                        className="absolute inset-0 bg-accent"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <Minimize2
                      className={`relative z-10 w-4 h-4 ${gridDensity === 'compact' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    />
                    <span
                      className={`relative z-10 ${gridDensity === 'compact' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                    >
                      Compact
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="md:hidden text-xs text-muted mb-4">
            Pinch with two fingers to switch grid size. Use the controls below to change layout.
          </div>

          <div
            className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4"
            aria-label="Mobile grid controls"
          >
            <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Layout
              </span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLayoutMode('masonry')}
                  className="relative px-2.5 py-1.5 text-xs transition-colors"
                  aria-pressed={gridLayout === 'masonry'}
                >
                  {gridLayout === 'masonry' && (
                    <motion.div
                      layoutId="mobile-layout-active"
                      className="absolute inset-0 bg-accent"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${gridLayout === 'masonry' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                  >
                    Masonry
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('uniform')}
                  className="relative px-2.5 py-1.5 text-xs border-l border-border transition-colors"
                  aria-pressed={gridLayout === 'uniform'}
                >
                  {gridLayout === 'uniform' && (
                    <motion.div
                      layoutId="mobile-layout-active"
                      className="absolute inset-0 bg-accent"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${gridLayout === 'uniform' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                  >
                    Uniform
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Grid size
              </span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGridMode('large')}
                  className="relative px-2.5 py-1.5 text-xs transition-colors"
                  aria-pressed={gridDensity === 'large'}
                >
                  {gridDensity === 'large' && (
                    <motion.div
                      layoutId="mobile-density-active"
                      className="absolute inset-0 bg-accent"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${gridDensity === 'large' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                  >
                    Large
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setGridMode('compact')}
                  className="relative px-2.5 py-1.5 text-xs border-l border-border transition-colors"
                  aria-pressed={gridDensity === 'compact'}
                >
                  {gridDensity === 'compact' && (
                    <motion.div
                      layoutId="mobile-density-active"
                      className="absolute inset-0 bg-accent"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${gridDensity === 'compact' ? 'text-accent-foreground' : 'text-text/80 dark:text-accent-foreground/80'}`}
                  >
                    Compact
                  </span>
                </button>
              </div>
            </div>
          </div>

          {photos.length > 0 ? (
            <>
              <motion.div
                layout
                layoutRoot
                transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
                className={gridClassNames}
                ref={gridRef}
              >
                {photos.map((photo, index) => (
                  <motion.div
                    layout={isSwitchingLayoutType ? 'position' : true}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{
                      y: -6,
                      scale: 1.01,
                      transition: { duration: 0.2 },
                    }}
                    transition={{
                      layout: { duration: 0.3, ease: 'easeInOut' },
                      opacity: { duration: 0.2 },
                      scale: { duration: 0.2 },
                    }}
                    key={photo.photo_id}
                    className={`pg-card relative group ${gridLayout === 'uniform' ? 'pg-card--uniform' : ''}`}
                    data-testid="public-batch"
                  >
                    <button
                      onClick={() => openPhoto(index)}
                      className="w-full p-0 border-0 bg-transparent cursor-pointer block"
                      aria-label={`Photo ${photo.photo_id}`}
                    >
                      <div
                        className={`pg-card__media ${gridLayout === 'uniform' ? 'pg-card__media--uniform' : ''}`}
                      >
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
                  </motion.div>
                ))}
              </motion.div>

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
