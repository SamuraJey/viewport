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

  const computeSpans = useCallback(() => {
    if (gridLayout !== 'masonry') return;
    const grid = gridRef.current;
    if (!grid) return;

    const cs = getComputedStyle(grid);
    const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap = parseFloat(cs.getPropertyValue('gap')) || 20;

    const gridWidth = grid.offsetWidth;
    const gridColStyle = cs.getPropertyValue('grid-template-columns');
    const numCols = gridColStyle.split(' ').filter((s) => s.trim() !== '').length || 1;
    const colWidth = (gridWidth - (numCols - 1) * rowGap) / numCols;

    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((item, index) => {
      const photo = photos[index];
      if (!photo) return;

      const width = photo.width || 4;
      const height = photo.height || 3;
      const ratio = width / height;

      const targetHeight = colWidth / ratio;
      const span = Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap));
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    });
  }, [gridLayout, photos]);

  useEffect(() => {
    if (gridLayout !== 'masonry') return undefined;
    const grid = gridRef.current;
    if (!grid) return undefined;

    const schedule = () => {
      if (computeSpansDebounceRef.current) cancelAnimationFrame(computeSpansDebounceRef.current);
      computeSpansDebounceRef.current = requestAnimationFrame(() => computeSpans());
    };

    const resizeObserver = new ResizeObserver(() => schedule());
    resizeObserver.observe(grid);

    return () => {
      resizeObserver.disconnect();
      if (computeSpansDebounceRef.current) {
        cancelAnimationFrame(computeSpansDebounceRef.current);
        computeSpansDebounceRef.current = null;
      }
    };
  }, [photos, gridLayout, computeSpans]);

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
