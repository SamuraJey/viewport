import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
  type TouchEvent as ReactTouchEvent,
  type TouchList as ReactTouchList,
} from 'react';
import { getPublicGallerySpacingClassName } from '../components/public-gallery/galleryAppearance';
import {
  DEFAULT_FALLBACK_RATIO,
  getCachedPhotoAspectRatio,
  setCachedPhotoAspectRatio,
} from '../lib/photoAspectRatioCache';
import {
  computeJustifiedLayout,
  computeMasonrySpans,
  getPublicPhotoAspectRatio,
  hasIntrinsicPublicPhotoAspectRatio,
  type PublicGridDensity,
  type PublicGridLayout,
} from '../lib/publicPhotoGridLayout';
import type { PhotoSpacing } from '../types/gallery';
import type { PublicPhoto } from '../types';

export type { PublicGridDensity, PublicGridLayout } from '../lib/publicPhotoGridLayout';

interface UsePublicGalleryGridProps {
  photos: PublicPhoto[];
  spacing?: PhotoSpacing;
  initialLayout?: PublicGridLayout;
  initialDensity?: PublicGridDensity;
}

interface GridMetrics {
  containerWidth: number;
  columnWidth: number;
  columns: number;
  gap: number;
  rowHeight: number;
}

const DEFAULT_GRID_METRICS: GridMetrics = {
  containerWidth: 0,
  columnWidth: 0,
  columns: 1,
  gap: 16,
  rowHeight: 8,
};

const JUSTIFIED_TARGET_HEIGHT = {
  desktop: { large: 360, compact: 260 },
  mobile: { large: 240, compact: 180 },
} as const;

const toPositiveNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getGridColumnCount = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const calculateTouchDistance = (touches: ReactTouchList): number => {
  if (touches.length < 2) return 0;
  const first = typeof touches.item === 'function' ? touches.item(0) : touches[0];
  const second = typeof touches.item === 'function' ? touches.item(1) : touches[1];
  if (!first || !second) return 0;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

const metricsEqual = (left: GridMetrics, right: GridMetrics): boolean =>
  left.containerWidth === right.containerWidth &&
  left.columnWidth === right.columnWidth &&
  left.columns === right.columns &&
  left.gap === right.gap &&
  left.rowHeight === right.rowHeight;

export const usePublicGalleryGrid = ({
  photos,
  spacing = 'medium',
  initialLayout = 'masonry',
  initialDensity = 'large',
}: UsePublicGalleryGridProps) => {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null);
  const [gridLayout, setGridLayout] = useState<PublicGridLayout>(initialLayout);
  const [gridDensity, setGridDensity] = useState<PublicGridDensity>(initialDensity);
  const [metrics, setMetrics] = useState<GridMetrics>(DEFAULT_GRID_METRICS);
  const [aspectRatioVersion, setAspectRatioVersion] = useState(0);
  const measureRafRef = useRef<number | null>(null);
  const ratioRefreshRafRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  const setGridRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    gridRef.current = node;
    setGridNode((current) => (current === node ? current : node));
  }, []);

  const photosUsingRatioCache = useMemo(
    () =>
      new Set(
        photos
          .filter((photo) => !hasIntrinsicPublicPhotoAspectRatio(photo))
          .map((photo) => photo.photo_id),
      ),
    [photos],
  );

  const getAspectRatioHint = useCallback((photo: PublicPhoto): number => {
    const cachedRatio = getCachedPhotoAspectRatio(photo.photo_id);
    return getPublicPhotoAspectRatio(photo, cachedRatio ?? DEFAULT_FALLBACK_RATIO);
  }, []);

  const measureGrid = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const computedStyle = getComputedStyle(grid);
    const containerWidth = grid.clientWidth || grid.getBoundingClientRect().width || 0;
    const gap =
      toPositiveNumber(computedStyle.getPropertyValue('column-gap'), 0) ||
      toPositiveNumber(computedStyle.getPropertyValue('gap'), 16);
    const rowHeight = toPositiveNumber(computedStyle.getPropertyValue('grid-auto-rows'), 8);
    const columns = getGridColumnCount(computedStyle.getPropertyValue('--pg-columns'));
    const totalGap = gap * Math.max(columns - 1, 0);
    const columnWidth = Math.max(0, (containerWidth - totalGap) / columns);
    const nextMetrics = { containerWidth, columnWidth, columns, gap, rowHeight };

    setMetrics((current) => (metricsEqual(current, nextMetrics) ? current : nextMetrics));
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current !== null) return;
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = null;
      measureGrid();
    });
  }, [measureGrid]);

  const scheduleRatioRefresh = useCallback(() => {
    if (ratioRefreshRafRef.current !== null) return;
    ratioRefreshRafRef.current = requestAnimationFrame(() => {
      ratioRefreshRafRef.current = null;
      setAspectRatioVersion((version) => version + 1);
    });
  }, []);

  const cancelScheduledWork = useCallback(() => {
    if (measureRafRef.current !== null) {
      cancelAnimationFrame(measureRafRef.current);
      measureRafRef.current = null;
    }
    if (ratioRefreshRafRef.current !== null) {
      cancelAnimationFrame(ratioRefreshRafRef.current);
      ratioRefreshRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!gridNode) return undefined;

    const handleImageLoad = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;

      const photoId = target.closest<HTMLElement>('[data-photo-id]')?.dataset.photoId;
      const naturalRatio =
        target.naturalWidth > 0 && target.naturalHeight > 0
          ? target.naturalWidth / target.naturalHeight
          : null;

      if (
        photoId &&
        photosUsingRatioCache.has(photoId) &&
        naturalRatio &&
        setCachedPhotoAspectRatio(photoId, naturalRatio)
      ) {
        scheduleRatioRefresh();
      }
      scheduleMeasure();
    };

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(gridNode);
    gridNode.addEventListener('load', handleImageLoad, true);
    scheduleMeasure();

    return () => {
      gridNode.removeEventListener('load', handleImageLoad, true);
      resizeObserver.disconnect();
      cancelScheduledWork();
    };
  }, [cancelScheduledWork, gridNode, photosUsingRatioCache, scheduleMeasure, scheduleRatioRefresh]);

  useEffect(() => {
    scheduleMeasure();
  }, [gridDensity, gridLayout, gridNode, photos.length, scheduleMeasure, spacing]);

  const setGridMode = useCallback((mode: PublicGridDensity) => {
    startTransition(() => {
      setGridDensity((current) => (current === mode ? current : mode));
    });
  }, []);

  const setLayoutMode = useCallback((mode: PublicGridLayout) => {
    startTransition(() => {
      setGridLayout((current) => (current === mode ? current : mode));
    });
  }, []);

  const handleTouchStart = useCallback((event: ReactTouchEvent) => {
    if (window.innerWidth > 900 || event.touches.length !== 2) return;
    event.preventDefault();
    pinchStartDistanceRef.current = calculateTouchDistance(event.touches);
    pinchHandledRef.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (
        window.innerWidth > 900 ||
        event.touches.length < 2 ||
        pinchStartDistanceRef.current === null
      ) {
        return;
      }

      event.preventDefault();
      const delta = calculateTouchDistance(event.touches) - pinchStartDistanceRef.current;
      if (!pinchHandledRef.current && Math.abs(delta) > 32) {
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

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    }),
    [handleTouchEnd, handleTouchMove, handleTouchStart],
  );

  const gridClassNames = useMemo(() => {
    const densityClass =
      gridLayout === 'masonry'
        ? gridDensity === 'compact'
          ? 'pg-grid--compact'
          : 'pg-grid--large'
        : gridLayout === 'uniform'
          ? gridDensity === 'compact'
            ? 'pg-grid-uniform--compact'
            : 'pg-grid-uniform--large'
          : gridDensity === 'compact'
            ? 'pg-grid-justified--compact'
            : 'pg-grid-justified--large';

    return [
      'pg-grid',
      `pg-grid-layout-${gridLayout}`,
      densityClass,
      gridLayout === 'masonry' && metrics.containerWidth === 0 ? 'pg-grid--measuring' : '',
      getPublicGallerySpacingClassName(spacing),
      'pg-gesture-surface',
    ]
      .filter(Boolean)
      .join(' ');
  }, [gridDensity, gridLayout, metrics.containerWidth, spacing]);

  const itemStyleById = useMemo(() => {
    void aspectRatioVersion;
    const styles = new Map<string, CSSProperties>();

    if (gridLayout === 'uniform') return styles;

    if (gridLayout === 'justified') {
      const compact = gridDensity === 'compact';
      const mobile = metrics.containerWidth > 0 && metrics.containerWidth < 640;
      const viewport = mobile ? JUSTIFIED_TARGET_HEIGHT.mobile : JUSTIFIED_TARGET_HEIGHT.desktop;
      const targetRowHeight = compact ? viewport.compact : viewport.large;

      if (metrics.containerWidth === 0) {
        photos.forEach((photo) => {
          const ratio = getAspectRatioHint(photo);
          styles.set(photo.photo_id, {
            width: ratio * targetRowHeight,
            height: targetRowHeight,
            flexBasis: ratio * targetRowHeight,
          });
        });
        return styles;
      }

      const { itemGeometryById } = computeJustifiedLayout(photos, {
        targetRowHeight,
        gap: metrics.gap,
        containerWidth: metrics.containerWidth,
        maxCropRatio: 1.5,
        getAspectRatio: getAspectRatioHint,
      });
      itemGeometryById.forEach((geometry, photoId) => {
        styles.set(photoId, {
          width: geometry.width,
          height: geometry.height,
          flexBasis: geometry.width,
        });
      });
      return styles;
    }

    if (metrics.columnWidth === 0) return styles;
    const spans = computeMasonrySpans(photos, {
      columnWidth: metrics.columnWidth,
      gap: metrics.gap,
      rowHeight: metrics.rowHeight,
      getAspectRatio: getAspectRatioHint,
    });
    photos.forEach((photo, index) => {
      styles.set(photo.photo_id, { gridRowEnd: `span ${spans[index]}` });
    });
    return styles;
  }, [aspectRatioVersion, getAspectRatioHint, gridDensity, gridLayout, metrics, photos]);

  const getItemStyle = useCallback(
    (photo: PublicPhoto): CSSProperties => itemStyleById.get(photo.photo_id) ?? {},
    [itemStyleById],
  );

  return {
    gridDensity,
    gridLayout,
    gridRef,
    setGridRef,
    gridClassNames,
    getAspectRatioHint,
    getItemStyle,
    setGridMode,
    setLayoutMode,
    touchHandlers,
  };
};
