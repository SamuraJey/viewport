const STORAGE_KEY = 'viewport:public-photo-ratios:v1';
const DEFAULT_FALLBACK_RATIO = 4 / 3;
const MIN_RATIO = 0.05;
const MAX_RATIO = 20;

const ratioCache = new Map<string, number>();

let isHydrated = false;

const normalizePhotoAspectRatio = (ratio: number | null | undefined): number | null => {
  if (!ratio || !Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return null;
  }

  return ratio;
};

const persistRatioCache = () => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(ratioCache)));
  } catch {
    // Storage access can fail in private mode or restrictive environments.
  }
};

export const hydratePhotoAspectRatioCache = () => {
  if (isHydrated) return;
  isHydrated = true;

  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    let shouldRewriteStorage = false;

    Object.entries(parsed).forEach(([photoId, rawRatio]) => {
      const ratio = normalizePhotoAspectRatio(
        typeof rawRatio === 'number' ? rawRatio : Number(rawRatio),
      );

      if (!ratio) {
        shouldRewriteStorage = true;
        return;
      }

      ratioCache.set(photoId, ratio);
    });

    if (shouldRewriteStorage) {
      persistRatioCache();
    }
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
};

export const getCachedPhotoAspectRatio = (photoId: string): number | undefined => {
  hydratePhotoAspectRatioCache();

  if (!photoId) {
    return undefined;
  }

  return ratioCache.get(photoId);
};

export const setCachedPhotoAspectRatio = (photoId: string, ratio: number): boolean => {
  hydratePhotoAspectRatioCache();

  const normalizedRatio = normalizePhotoAspectRatio(ratio);
  if (!photoId || !normalizedRatio) {
    return false;
  }

  if (ratioCache.get(photoId) === normalizedRatio) {
    return false;
  }

  ratioCache.set(photoId, normalizedRatio);
  persistRatioCache();

  return true;
};

export { DEFAULT_FALLBACK_RATIO };
