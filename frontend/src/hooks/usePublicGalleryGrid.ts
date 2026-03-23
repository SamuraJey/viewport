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

const DEFAULT_FALLBACK_RATIO = 4 / 3;

const toValidRatio = (value: number | null | undefined): number | null => {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return value;
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
  const ratioCacheRef = useRef<Map<string, number>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  const getRatioFromPhotoOrImage = useCallback((photo: PublicPhoto, item: HTMLElement): number => {
    const cachedRatio = ratioCacheRef.current.get(photo.photo_id);
    const apiRatio =
      toValidRatio(photo.width) && toValidRatio(photo.height)
        ? (photo.width as number) / (photo.height as number)
        : null;

    if (cachedRatio) {
      return cachedRatio;
    }

    if (apiRatio) {
      ratioCacheRef.current.set(photo.photo_id, apiRatio);
      return apiRatio;
    }

    const image = item.querySelector('img');
    if (image instanceof HTMLImageElement) {
      const naturalRatio =
        toValidRatio(image.naturalWidth) && toValidRatio(image.naturalHeight)
          ? image.naturalWidth / image.naturalHeight
          : null;
      if (naturalRatio) {
        ratioCacheRef.current.set(photo.photo_id, naturalRatio);
        return naturalRatio;
      }
    }

    return DEFAULT_FALLBACK_RATIO;
  }, []);

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

      const ratio = getRatioFromPhotoOrImage(photo, item);
      const itemWidth = item.getBoundingClientRect().width || item.offsetWidth || 0;
      if (itemWidth <= 0) return;

      const targetHeight = itemWidth / ratio;
      const span = Math.max(1, Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap)));
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    });
  }, [getRatioFromPhotoOrImage, gridLayout, photos]);

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
          ratioCacheRef.current.set(photoId, naturalRatio);
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
  }, [gridLayout, photos, scheduleComputeSpans, cancelScheduledCompute]);

  useEffect(() => {
    const activePhotoIds = new Set(photos.map((photo) => photo.photo_id));
    const cache = ratioCacheRef.current;
    Array.from(cache.keys()).forEach((photoId) => {
      if (!activePhotoIds.has(photoId)) {
        cache.delete(photoId);
      }
    });
  }, [photos]);

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
    setGridMode,
    setLayoutMode,
    touchHandlers,
  };
};
