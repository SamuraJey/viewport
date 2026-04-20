const STORAGE_KEY = 'viewport:public-photo-ratios:v1';
const DEFAULT_FALLBACK_RATIO = 4 / 3;
const MIN_RATIO = 0.05;
const MAX_RATIO = 20;
const MAX_CACHE_ENTRIES = 3000;
const PERSIST_DEBOUNCE_MS = 200;

const ratioCache = new Map<string, number>();

let isHydrated = false;
let persistTimeoutId: number | null = null;
let idlePersistId: number | null = null;

const normalizePhotoAspectRatio = (ratio: number | null | undefined): number | null => {
  if (!ratio || !Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return null;
  }

  return ratio;
};

const touchCachedPhotoAspectRatio = (photoId: string, ratio: number) => {
  ratioCache.delete(photoId);
  ratioCache.set(photoId, ratio);
};

const trimCacheToLimit = (maxEntries = MAX_CACHE_ENTRIES): boolean => {
  let trimmed = false;

  while (ratioCache.size > maxEntries) {
    const oldestEntry = ratioCache.keys().next();
    if (oldestEntry.done) {
      break;
    }

    ratioCache.delete(oldestEntry.value);
    trimmed = true;
  }

  return trimmed;
};

const clearScheduledPersistence = () => {
  if (typeof window === 'undefined') return;

  if (persistTimeoutId !== null) {
    window.clearTimeout(persistTimeoutId);
    persistTimeoutId = null;
  }

  if (idlePersistId !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(idlePersistId);
    idlePersistId = null;
  }
};

const persistRatioCacheNow = () => {
  if (typeof window === 'undefined') return;

  clearScheduledPersistence();
  trimCacheToLimit();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(ratioCache)));
      return;
    } catch {
      if (ratioCache.size === 0) {
        break;
      }

      trimCacheToLimit(Math.max(0, Math.floor(ratioCache.size * 0.8)));
    }
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage access can fail in private mode or restrictive environments.
  }
};

const schedulePersistRatioCache = () => {
  if (typeof window === 'undefined') return;

  if (persistTimeoutId !== null || idlePersistId !== null) {
    return;
  }

  persistTimeoutId = window.setTimeout(() => {
    persistTimeoutId = null;

    if (typeof window.requestIdleCallback === 'function') {
      idlePersistId = window.requestIdleCallback(() => {
        idlePersistId = null;
        persistRatioCacheNow();
      });
      return;
    }

    persistRatioCacheNow();
  }, PERSIST_DEBOUNCE_MS);
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

    let shouldPersist = false;

    Object.entries(parsed).forEach(([photoId, rawRatio]) => {
      const ratio = normalizePhotoAspectRatio(
        typeof rawRatio === 'number' ? rawRatio : Number(rawRatio),
      );

      if (!ratio) {
        shouldPersist = true;
        return;
      }

      touchCachedPhotoAspectRatio(photoId, ratio);
    });

    if (trimCacheToLimit()) {
      shouldPersist = true;
    }

    if (shouldPersist) {
      schedulePersistRatioCache();
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

  const cachedRatio = ratioCache.get(photoId);
  if (cachedRatio === undefined) {
    return undefined;
  }

  touchCachedPhotoAspectRatio(photoId, cachedRatio);

  return cachedRatio;
};

export const setCachedPhotoAspectRatio = (photoId: string, ratio: number): boolean => {
  hydratePhotoAspectRatioCache();

  const normalizedRatio = normalizePhotoAspectRatio(ratio);
  if (!photoId || !normalizedRatio) {
    return false;
  }

  if (ratioCache.get(photoId) === normalizedRatio) {
    touchCachedPhotoAspectRatio(photoId, normalizedRatio);
    return false;
  }

  touchCachedPhotoAspectRatio(photoId, normalizedRatio);
  trimCacheToLimit();
  schedulePersistRatioCache();

  return true;
};

export { DEFAULT_FALLBACK_RATIO };
