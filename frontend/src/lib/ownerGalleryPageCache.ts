import type { GalleryDetail } from '../types/gallery';

const PAGE_TTL_MS = 30_000;
const MAX_PAGES = 3;
const MAX_WARM_THUMBNAILS = 8;

/** Route-local cache: no storage, original images, or cross-gallery reuse. */
export class OwnerGalleryPageCache {
  private pages = new Map<number, { data: GalleryDetail; expires: number }>();
  private inFlight = new Map<number, Promise<GalleryDetail>>();
  private generation = 0;
  private cancelPrefetch?: () => void;
  private warmImages = new Set<HTMLImageElement>();
  private warmGeneration = 0;
  private load: (page: number) => Promise<GalleryDetail>;

  constructor(load: (page: number) => Promise<GalleryDetail>) {
    this.load = load;
  }

  get revision(): number {
    return this.generation;
  }

  clear() {
    this.generation++;
    this.warmGeneration++;
    this.pages.clear();
    this.inFlight.clear();
    this.cancelPrefetch?.();
    this.cancelPrefetch = undefined;
    for (const image of this.warmImages) image.removeAttribute('src');
    this.warmImages.clear();
  }

  async get(page: number): Promise<GalleryDetail> {
    const cached = this.pages.get(page);
    if (cached && cached.expires > Date.now()) {
      this.pages.delete(page);
      this.pages.set(page, cached);
      return cached.data;
    }
    this.pages.delete(page);
    const pending = this.inFlight.get(page);
    if (pending) return pending;
    const generation = this.generation;
    const request = this.load(page)
      .then((data) => {
        if (generation === this.generation && !hasUnfinishedPhotos(data)) {
          this.pages.set(page, { data, expires: Date.now() + PAGE_TTL_MS });
          while (this.pages.size > MAX_PAGES) this.pages.delete(this.pages.keys().next().value!);
        }
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(page) === request) this.inFlight.delete(page);
      });
    this.inFlight.set(page, request);
    return request;
  }

  prefetchNext(page: number, pageSize: number, current: GalleryDetail) {
    this.cancelPrefetch?.();
    this.cancelPrefetch = undefined;
    if (page * pageSize >= current.total_photos || hasUnfinishedPhotos(current)) return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
    const generation = this.generation;
    const run = () => {
      this.cancelPrefetch = undefined;
      if (generation !== this.generation || document.visibilityState === 'hidden') return;
      void this.get(page + 1)
        .then((data) => {
          if (generation === this.generation) void this.warmThumbnails(data, generation);
        })
        .catch(() => {
          // A speculative failure must never become a page-level error.
        });
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 1000 });
      this.cancelPrefetch = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(run, 200);
      this.cancelPrefetch = () => window.clearTimeout(id);
    }
  }

  private async warmThumbnails(data: GalleryDetail, generation: number) {
    const warmGeneration = ++this.warmGeneration;
    // Retain at most eight decoded thumbnails and decode only two at a time.
    for (const image of this.warmImages) image.removeAttribute('src');
    this.warmImages.clear();
    const urls = [
      ...new Set(
        data.photos
          .slice(0, MAX_WARM_THUMBNAILS)
          .map((photo) => photo.thumbnail_url)
          .filter(Boolean),
      ),
    ];
    let cursor = 0;
    const worker = async () => {
      while (
        cursor < urls.length &&
        generation === this.generation &&
        warmGeneration === this.warmGeneration
      ) {
        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = 'low';
        this.warmImages.add(image);
        image.src = urls[cursor++];
        try {
          if (typeof image.decode === 'function') await image.decode();
        } catch {
          image.removeAttribute('src');
          this.warmImages.delete(image);
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }
}

function hasUnfinishedPhotos(data: GalleryDetail): boolean {
  return (
    Boolean(data.pending_rotation_count) ||
    data.photos.some(
      (photo) =>
        photo.status === 'pending' ||
        photo.status === 'processing' ||
        photo.rotation_status === 'pending' ||
        photo.rotation_status === 'processing',
    )
  );
}
