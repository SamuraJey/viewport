import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type TouchEvent as ReactTouchEvent,
  type TouchList as ReactTouchList,
} from 'react';
import type { PublicPhoto } from '../services/shareLinkService';

export type PublicGridDensity = 'large' | 'compact';
export type PublicGridLayout = 'masonry' | 'uniform';

interface UsePublicGalleryGridProps {
  photos: PublicPhoto[];
}

const calculateTouchDistance = (touches: ReactTouchList) => {
  if (touches.length < 2) return 0;
  const first = touches.item(0);
  const second = touches.item(1);
  if (!first || !second) return 0;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

export const usePublicGalleryGrid = ({ photos }: UsePublicGalleryGridProps) => {
  const [gridDensity, setGridDensity] = useState<PublicGridDensity>('large');
  const [gridLayout, setGridLayout] = useState<PublicGridLayout>('masonry');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const computeSpansDebounceRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  const scheduleComputeSpans = useCallback(
    (compute: () => void) => {
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
      }
      computeSpansDebounceRef.current = requestAnimationFrame(() => compute());
    },
    [],
  );

  const computeSpans = useCallback(() => {
    if (gridLayout !== 'masonry') return;
    const grid = gridRef.current;
    if (!grid) return;

    const cs = getComputedStyle(grid);
    const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap = parseFloat(cs.getPropertyValue('row-gap')) || parseFloat(cs.getPropertyValue('gap')) || 20;

    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((item, index) => {
      const photo = photos[index];
      if (!photo) return;

      // Fallback to loaded image natural size when API dimensions are unavailable.
      const image = item.querySelector('img');
      const naturalWidth = image instanceof HTMLImageElement ? image.naturalWidth : 0;
      const naturalHeight = image instanceof HTMLImageElement ? image.naturalHeight : 0;

      const width = (photo.width && photo.width > 0 ? photo.width : naturalWidth) || 4;
      const height = (photo.height && photo.height > 0 ? photo.height : naturalHeight) || 3;
      const ratioCandidate = width / height;
      const ratio = Number.isFinite(ratioCandidate) && ratioCandidate > 0 ? ratioCandidate : 4 / 3;
      const itemWidth = item.getBoundingClientRect().width || item.offsetWidth || 0;
      if (itemWidth <= 0) return;

      const targetHeight = itemWidth / ratio;
      const span = Math.max(1, Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap)));
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    });
  }, [gridLayout, photos]);

  useEffect(() => {
    if (gridLayout !== 'masonry') return undefined;
    const grid = gridRef.current;
    if (!grid) return undefined;

    const schedule = () => scheduleComputeSpans(computeSpans);

    const resizeObserver = new ResizeObserver(() => schedule());
    resizeObserver.observe(grid);

    const handleImageLoad = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement) {
        schedule();
      }
    };
    grid.addEventListener('load', handleImageLoad, true);

    return () => {
      grid.removeEventListener('load', handleImageLoad, true);
      resizeObserver.disconnect();
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [photos, gridLayout, computeSpans, scheduleComputeSpans]);

  useEffect(() => {
    if (gridLayout !== 'masonry') return;
    scheduleComputeSpans(computeSpans);
    return () => {
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [gridLayout, gridDensity, photos.length, computeSpans, scheduleComputeSpans]);

  const clearGridRowSpans = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    Array.from(grid.children).forEach((item) => {
      (item as HTMLElement).style.gridRowEnd = '';
    });
  }, []);

  useLayoutEffect(() => {
    if (gridLayout === 'masonry') return;
    clearGridRowSpans();
  }, [gridLayout, photos.length, clearGridRowSpans]);

  useLayoutEffect(() => {
    if (gridLayout !== 'masonry') return;
    computeSpans();
  }, [gridLayout, photos, computeSpans]);

  const setGridMode = useCallback((mode: PublicGridDensity) => {
    startTransition(() => {
      setGridDensity((prev) => (prev === mode ? prev : mode));
    });
  }, []);

  const setLayoutMode = useCallback((mode: PublicGridLayout) => {
    startTransition(() => {
      setGridLayout((prev) => (prev === mode ? prev : mode));
    });
  }, []);

  const handleTouchStart = useCallback((event: ReactTouchEvent) => {
    if (window.innerWidth > 900) return;
    if (event.touches.length === 2) {
      event.preventDefault();
      pinchStartDistanceRef.current = calculateTouchDistance(event.touches);
      pinchHandledRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (window.innerWidth > 900) return;
      if (event.touches.length < 2 || pinchStartDistanceRef.current === null) return;

      event.preventDefault();

      const currentDistance = calculateTouchDistance(event.touches);
      const delta = currentDistance - pinchStartDistanceRef.current;
      const threshold = 32;

      if (!pinchHandledRef.current && Math.abs(delta) > threshold) {
        setGridMode(delta < 0 ? 'compact' : 'large');
        pinchHandledRef.current = true;
      }
    },
    [setGridMode],
  );

  const handleTouchEnd = useCallback(() => {
    pinchStartDistanceRef.current = null;
    pinchHandledRef.current = false;
  }, []);

  const gridClassNames = useMemo(
    () =>
      [
        'pg-grid',
        gridLayout === 'masonry'
          ? gridDensity === 'compact'
            ? 'pg-grid--compact'
            : 'pg-grid--large'
          : gridDensity === 'compact'
            ? 'pg-grid-uniform--compact'
            : 'pg-grid-uniform--large',
        'pg-gesture-surface',
      ].join(' '),
    [gridDensity, gridLayout],
  );

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    }),
    [handleTouchEnd, handleTouchMove, handleTouchStart],
  );

  return {
    gridDensity,
    gridLayout,
    gridRef,
    gridClassNames,
    setGridMode,
    setLayoutMode,
    touchHandlers,
  };
};
