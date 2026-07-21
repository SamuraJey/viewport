export type PublicGridLayout = 'masonry' | 'uniform' | 'justified';
export type PublicGridDensity = 'large' | 'compact';

export interface PublicPhotoGridItem {
  photo_id: string;
  width?: number | null;
  height?: number | null;
  ratio?: number | null;
}

interface AspectRatioOptions<T> {
  getAspectRatio?: (item: T, index: number) => number | null | undefined;
  fallbackRatio?: number;
}

export interface MasonryLayoutOptions<T> extends AspectRatioOptions<T> {
  columnWidth: number;
  gap: number;
  rowHeight: number;
}

export interface JustifiedLayoutOptions<T> extends AspectRatioOptions<T> {
  targetRowHeight: number;
  gap: number;
  containerWidth: number;
  maxCropRatio?: number;
}

export interface JustifiedItemGeometry {
  photoId: string;
  index: number;
  rowIndex: number;
  aspectRatio: number;
  width: number;
  height: number;
}

export interface JustifiedLayoutRow<T> {
  items: Array<JustifiedItemGeometry & { item: T }>;
  width: number;
  height: number;
  isComplete: boolean;
}

export interface JustifiedLayout<T> {
  rows: JustifiedLayoutRow<T>[];
  itemGeometry: JustifiedItemGeometry[];
  itemGeometryById: Map<string, JustifiedItemGeometry>;
}

export const DEFAULT_PUBLIC_PHOTO_ASPECT_RATIO = 4 / 3;
const MIN_ASPECT_RATIO = 0.05;
const MAX_ASPECT_RATIO = 20;
const JUSTIFIED_ROW_ROUNDING_GUARD_PX = 0.5;

const toPositiveFinite = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
};

const clampAspectRatio = (ratio: number): number =>
  Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, ratio));

const normalizeGap = (gap: number): number => (Number.isFinite(gap) && gap > 0 ? gap : 0);

const normalizeContainerWidth = (width: number): number =>
  Number.isFinite(width) && width > 0 ? width : 0;

const normalizeTargetRowHeight = (height: number): number => toPositiveFinite(height) ?? 1;

export const hasIntrinsicPublicPhotoAspectRatio = (item: PublicPhotoGridItem): boolean => {
  if (toPositiveFinite(item.ratio) !== null) return true;
  return toPositiveFinite(item.width) !== null && toPositiveFinite(item.height) !== null;
};

export const getPublicPhotoAspectRatio = (
  item: PublicPhotoGridItem,
  fallbackRatio = DEFAULT_PUBLIC_PHOTO_ASPECT_RATIO,
): number => {
  const explicitRatio = toPositiveFinite(item.ratio);
  if (explicitRatio !== null) return clampAspectRatio(explicitRatio);

  const width = toPositiveFinite(item.width);
  const height = toPositiveFinite(item.height);
  if (width !== null && height !== null) return clampAspectRatio(width / height);

  return clampAspectRatio(
    toPositiveFinite(fallbackRatio) ?? DEFAULT_PUBLIC_PHOTO_ASPECT_RATIO,
  );
};

const resolveAspectRatio = <T extends PublicPhotoGridItem>(
  item: T,
  index: number,
  options: AspectRatioOptions<T>,
): number => {
  const customRatio = toPositiveFinite(options.getAspectRatio?.(item, index));
  return customRatio === null
    ? getPublicPhotoAspectRatio(item, options.fallbackRatio)
    : clampAspectRatio(customRatio);
};

const resolveJustifiedAspectRatio = <T extends PublicPhotoGridItem>(
  item: T,
  index: number,
  options: JustifiedLayoutOptions<T>,
): number => {
  const ratio = resolveAspectRatio(item, index, options);
  const configuredMaxCropRatio = toPositiveFinite(options.maxCropRatio);
  const maxCropRatio =
    configuredMaxCropRatio === null || configuredMaxCropRatio < 1 ? 1.5 : configuredMaxCropRatio;
  return Math.min(maxCropRatio, Math.max(1 / maxCropRatio, ratio));
};

export const computeMasonrySpans = <T extends PublicPhotoGridItem>(
  items: readonly T[],
  options: MasonryLayoutOptions<T>,
): number[] => {
  const columnWidth = normalizeContainerWidth(options.columnWidth);
  const gap = normalizeGap(options.gap);
  const rowHeight = toPositiveFinite(options.rowHeight);
  if (columnWidth === 0 || rowHeight === null) return items.map(() => 1);

  return items.map((item, index) => {
    const ratio = resolveAspectRatio(item, index, options);
    const targetHeight = columnWidth / ratio;
    return Math.max(1, Math.ceil((targetHeight + gap) / (rowHeight + gap)));
  });
};

interface GroupedRow<T> {
  items: T[];
  indices: number[];
  ratios: number[];
  isComplete: boolean;
}

const groupJustifiedItems = <T extends PublicPhotoGridItem>(
  items: readonly T[],
  options: JustifiedLayoutOptions<T>,
): GroupedRow<T>[] => {
  if (items.length === 0) return [];

  const targetRowHeight = normalizeTargetRowHeight(options.targetRowHeight);
  const containerWidth = normalizeContainerWidth(options.containerWidth);
  const gap = normalizeGap(options.gap);
  const rows: GroupedRow<T>[] = [];
  let currentItems: T[] = [];
  let currentIndices: number[] = [];
  let currentRatios: number[] = [];
  let currentWidth = 0;

  items.forEach((item, index) => {
    const ratio = resolveJustifiedAspectRatio(item, index, options);
    const itemWidth = ratio * targetRowHeight;
    const projectedWidth = currentWidth + itemWidth + (currentItems.length > 0 ? gap : 0);
    currentItems.push(item);
    currentIndices.push(index);
    currentRatios.push(ratio);
    currentWidth = projectedWidth;

    if (containerWidth > 0 && currentWidth >= containerWidth) {
      rows.push({
        items: currentItems,
        indices: currentIndices,
        ratios: currentRatios,
        isComplete: true,
      });
      currentItems = [];
      currentIndices = [];
      currentRatios = [];
      currentWidth = 0;
    }
  });

  if (currentItems.length > 0) {
    rows.push({
      items: currentItems,
      indices: currentIndices,
      ratios: currentRatios,
      isComplete: false,
    });
  }
  return rows;
};

export const computeJustifiedRows = <T extends PublicPhotoGridItem>(
  items: readonly T[],
  options: JustifiedLayoutOptions<T>,
): T[][] => groupJustifiedItems(items, options).map((row) => row.items);

export const computeJustifiedLayout = <T extends PublicPhotoGridItem>(
  items: readonly T[],
  options: JustifiedLayoutOptions<T>,
): JustifiedLayout<T> => {
  const groupedRows = groupJustifiedItems(items, options);
  const targetRowHeight = normalizeTargetRowHeight(options.targetRowHeight);
  const containerWidth = normalizeContainerWidth(options.containerWidth);
  const gap = normalizeGap(options.gap);
  const itemGeometry: JustifiedItemGeometry[] = Array.from({ length: items.length });
  const itemGeometryById = new Map<string, JustifiedItemGeometry>();

  const rows = groupedRows.map((group, rowIndex): JustifiedLayoutRow<T> => {
    const isComplete = group.isComplete;
    const gapWidth = gap * Math.max(group.items.length - 1, 0);
    const ratioSum = group.ratios.reduce((sum, ratio) => sum + ratio, 0);
    const availableWidth =
      containerWidth === 0
        ? ratioSum * targetRowHeight
        : Math.max(0, containerWidth - gapWidth);
    const fittedHeight = ratioSum > 0 ? availableWidth / ratioSum : 0;
    const rowHeight = isComplete ? fittedHeight : Math.min(targetRowHeight, fittedHeight);

    let consumedWidth = 0;
    const layoutItems = group.items.map((item, itemIndex) => {
      const index = group.indices[itemIndex];
      const aspectRatio = group.ratios[itemIndex];
      const idealWidth = aspectRatio * rowHeight;
      const isLastCompletedItem = isComplete && itemIndex === group.items.length - 1;
      const width = isLastCompletedItem
        ? Math.max(
            1,
            availableWidth - consumedWidth - JUSTIFIED_ROW_ROUNDING_GUARD_PX,
          )
        : idealWidth;
      consumedWidth += width;

      const geometry: JustifiedItemGeometry = {
        photoId: item.photo_id,
        index,
        rowIndex,
        aspectRatio,
        width,
        height: rowHeight,
      };
      itemGeometry[index] = geometry;
      itemGeometryById.set(item.photo_id, geometry);
      return { ...geometry, item };
    });

    return {
      items: layoutItems,
      width: consumedWidth + gapWidth,
      height: rowHeight,
      isComplete,
    };
  });

  return { rows, itemGeometry, itemGeometryById };
};
