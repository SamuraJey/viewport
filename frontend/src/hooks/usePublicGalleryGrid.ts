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
import {
  DEFAULT_FALLBACK_RATIO,
  getCachedPhotoAspectRatio,
  setCachedPhotoAspectRatio,
} from '../lib/photoAspectRatioCache';

export type PublicGridDensity = 'large' | 'compact';
export type PublicGridLayout = 'masonry' | 'uniform';

interface UsePublicGalleryGridProps {
  photos: PublicPhoto[];
}

const toValidRatio = (value: number | null | undefined): number | null => {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return value;
};

const getPhotoAspectRatio = (photo: PublicPhoto): number | null => {
  const width = toValidRatio(photo.width);
  const height = toValidRatio(photo.height);
  return width && height ? width / height : null;
};

const getGridColumnCount = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

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
  const computeSpansRafRef = useRef<number | null>(null);
  const hasScheduledComputeRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  const getAspectRatioHint = useCallback((photo: PublicPhoto) => {
    const apiRatio = getPhotoAspectRatio(photo);
    if (apiRatio) return apiRatio;

    return getCachedPhotoAspectRatio(photo.photo_id) ?? DEFAULT_FALLBACK_RATIO;
  }, []);

  const computeSpans = useCallback(() => {
    if (gridLayout !== 'masonry') return;
    const grid = gridRef.current;
    if (!grid) return;

    const cs = getComputedStyle(grid);
    const containerWidth = grid.clientWidth || grid.getBoundingClientRect().width || 0;
    const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap =
      parseFloat(cs.getPropertyValue('row-gap')) || parseFloat(cs.getPropertyValue('gap')) || 20;
    const columns = getGridColumnCount(cs.getPropertyValue('--pg-columns'));
    const totalGap = rowGap * Math.max(columns - 1, 0);
    const columnWidth = (containerWidth - totalGap) / columns;

    if (columnWidth <= 0) return;

    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((item, index) => {
      const photo = photos[index];
      if (!photo) return;

      const ratio = getAspectRatioHint(photo);
      const targetHeight = columnWidth / ratio;
      const span = Math.max(1, Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap)));
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    });
  }, [getAspectRatioHint, gridLayout, photos]);

  const scheduleComputeSpans = useCallback(() => {
    if (gridLayout !== 'masonry') return;
    if (hasScheduledComputeRef.current) return;

    hasScheduledComputeRef.current = true;
    computeSpansRafRef.current = requestAnimationFrame(() => {
      hasScheduledComputeRef.current = false;
      computeSpansRafRef.current = null;
      computeSpans();
    });
  }, [computeSpans, gridLayout]);

  const cancelScheduledCompute = useCallback(() => {
    if (computeSpansRafRef.current) {
      cancelAnimationFrame(computeSpansRafRef.current);
      computeSpansRafRef.current = null;
    }
    hasScheduledComputeRef.current = false;
  }, []);

  useEffect(() => {
    if (gridLayout !== 'masonry') return undefined;
    const grid = gridRef.current;
    if (!grid) return undefined;

    const handleImageLoad = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;

      const photoCard = target.closest<HTMLElement>('[data-photo-id]');
      const photoId = photoCard?.dataset.photoId;
      if (photoId) {
        const naturalRatio =
          toValidRatio(target.naturalWidth) && toValidRatio(target.naturalHeight)
            ? target.naturalWidth / target.naturalHeight
            : null;

        if (naturalRatio) {
          setCachedPhotoAspectRatio(photoId, naturalRatio);
        }
      }

      scheduleComputeSpans();
    };

    const resizeObserver = new ResizeObserver(() => scheduleComputeSpans());
    resizeObserver.observe(grid);

    grid.addEventListener('load', handleImageLoad, true);

    scheduleComputeSpans();

    return () => {
      grid.removeEventListener('load', handleImageLoad, true);
      resizeObserver.disconnect();
      cancelScheduledCompute();
    };
  }, [gridLayout, scheduleComputeSpans, cancelScheduledCompute]);

  useEffect(() => {
    if (gridLayout !== 'masonry') return;
    scheduleComputeSpans();
  }, [gridLayout, gridDensity, photos.length, scheduleComputeSpans]);

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
    scheduleComputeSpans();
  }, [gridLayout, photos, scheduleComputeSpans]);

  useEffect(() => {
    return () => {
      cancelScheduledCompute();
    };
  }, [cancelScheduledCompute]);

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
    getAspectRatioHint,
    setGridMode,
    setLayoutMode,
    touchHandlers,
  };
};
