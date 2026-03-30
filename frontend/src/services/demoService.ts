import type {
  AuthTokens,
  BatchDeletePhotosResponse,
  Gallery,
  GalleryDetail,
  GalleryListQueryOptions,
  GalleryListSortBy,
  GalleryPhotoQueryOptions,
  GalleryPhotoSortBy,
  GalleryPhoto,
  GalleryListResponse,
  LoginRequest,
  LoginResponse,
  PhotoResponse,
  PhotoUploadResponse,
  RegisterRequest,
  RegisterResponse,
  ShareLink,
  ShareLinkAnalyticsResponse,
  ShareLinkDailyPoint,
  ShareLinksDashboardResponse,
  ShareLinkUpdateRequest,
  SharedGallery,
  SharedGalleryQueryOptions,
  User,
  UploadPreparedFile,
  SortOrder,
} from '../types';
import { ApiError } from '../lib/errorHandling';
import { isDemoModeEnabled } from '../lib/demoMode';

interface DemoGalleryState {
  gallery: Gallery;
  photos: GalleryPhoto[];
  shareLinks: ShareLink[];
}

interface DemoPersistedState {
  galleries: DemoGalleryState[];
  user: User;
}

const DEMO_OWNER_ID = 'demo-user-1';
const DEMO_STATE_STORAGE_KEY = 'viewport-demo-state-v1';

const makeDemoId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = (): string => new Date().toISOString();

const toGalleryWithComputedFields = (state: DemoGalleryState): Gallery => {
  const sortedRecentPhotos = [...state.photos].sort(
    (a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at),
  );
  const totalSize = state.photos.reduce((sum, photo) => sum + (photo.file_size || 0), 0);
  const hasActiveShareLinks = state.shareLinks.some((link) => {
    if (link.is_active === false) return false;
    if (!link.expires_at) return true;
    const expiresAt = Date.parse(link.expires_at);
    return Number.isNaN(expiresAt) ? true : expiresAt > Date.now();
  });

  const coverPhoto = state.gallery.cover_photo_id
    ? state.photos.find((photo) => photo.id === state.gallery.cover_photo_id) || null
    : null;

  return {
    ...state.gallery,
    photo_count: state.photos.length,
    total_size_bytes: totalSize,
    has_active_share_links: hasActiveShareLinks,
    cover_photo_thumbnail_url: coverPhoto?.thumbnail_url ?? null,
    recent_photo_thumbnail_urls: sortedRecentPhotos
      .slice(0, 3)
      .map((photo) => photo.thumbnail_url)
      .filter(Boolean),
  };
};

const buildPhoto = (galleryId: string, index: number): GalleryPhoto => {
  const seed = `${galleryId}-${index}`;
  const width = 2200 + (index % 5) * 120;
  const height = 1400 + (index % 4) * 90;

  return {
    id: `${galleryId}-photo-${index + 1}`,
    filename: `shot_${String(index + 1).padStart(3, '0')}.jpg`,
    url: `https://picsum.photos/seed/${seed}/1600/1100`,
    thumbnail_url: `https://picsum.photos/seed/${seed}/700/500`,
    width,
    height,
    file_size: 2_100_000 + index * 110_000,
    uploaded_at: nowIso(),
  };
};

const seedState = (): DemoGalleryState[] => {
  const galleries: Gallery[] = [
    {
      id: 'demo-gallery-fashion',
      owner_id: DEMO_OWNER_ID,
      name: 'Fashion Editorial SS26',
      created_at: '2026-03-10T12:00:00Z',
      shooting_date: '2026-03-09T08:30:00Z',
      public_sort_by: 'original_filename',
      public_sort_order: 'asc',
      cover_photo_id: null,
      photo_count: 0,
      total_size_bytes: 0,
      has_active_share_links: false,
      cover_photo_thumbnail_url: null,
      recent_photo_thumbnail_urls: [],
    },
    {
      id: 'demo-gallery-wedding',
      owner_id: DEMO_OWNER_ID,
      name: 'Wedding Weekend - Porto',
      created_at: '2026-03-06T09:40:00Z',
      shooting_date: '2026-03-04T14:00:00Z',
      public_sort_by: 'original_filename',
      public_sort_order: 'asc',
      cover_photo_id: null,
      photo_count: 0,
      total_size_bytes: 0,
      has_active_share_links: false,
      cover_photo_thumbnail_url: null,
      recent_photo_thumbnail_urls: [],
    },
    {
      id: 'demo-gallery-product',
      owner_id: DEMO_OWNER_ID,
      name: 'Product Launch Assets',
      created_at: '2026-02-27T16:20:00Z',
      shooting_date: '2026-02-25T11:00:00Z',
      public_sort_by: 'original_filename',
      public_sort_order: 'asc',
      cover_photo_id: null,
      photo_count: 0,
      total_size_bytes: 0,
      has_active_share_links: false,
      cover_photo_thumbnail_url: null,
      recent_photo_thumbnail_urls: [],
    },
  ];

  return galleries.map((gallery, galleryIndex) => {
    const photoCount = galleryIndex === 0 ? 14 : galleryIndex === 1 ? 10 : 8;
    const photos = Array.from({ length: photoCount }, (_, index) => buildPhoto(gallery.id, index));
    const coverPhoto = photos[0]?.id ?? null;

    const shareLinks: ShareLink[] = [
      {
        id: `${gallery.id}-share-${makeDemoId().slice(0, 8)}`,
        label: galleryIndex === 0 ? 'Preview for Ivan' : null,
        is_active: true,
        expires_at: null,
        views: 5 + galleryIndex * 4,
        zip_downloads: 1 + galleryIndex,
        single_downloads: 7 + galleryIndex * 2,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ];

    return {
      gallery: {
        ...gallery,
        cover_photo_id: coverPhoto,
        photo_count: photos.length,
        total_size_bytes: photos.reduce((sum, photo) => sum + (photo.file_size || 0), 0),
        has_active_share_links: shareLinks.some((link) => link.is_active !== false),
        cover_photo_thumbnail_url:
          photos.find((photo) => photo.id === coverPhoto)?.thumbnail_url ?? null,
        recent_photo_thumbnail_urls: photos
          .slice(0, 3)
          .map((photo) => photo.thumbnail_url)
          .filter(Boolean),
      },
      photos,
      shareLinks,
    };
  });
};

const demoUser: User = {
  id: DEMO_OWNER_ID,
  email: 'demo@viewport.local',
  display_name: 'Demo Photographer',
  storage_used: 0,
  storage_quota: 50 * 1024 * 1024 * 1024,
};

const makeDemoTokens = (): AuthTokens => ({
  access_token: `demo-access-${makeDemoId()}`,
  refresh_token: `demo-refresh-${makeDemoId()}`,
  token_type: 'bearer',
});

const parsePhotoIndex = (filename: string): string => {
  const base = filename.split('.').slice(0, -1).join('.') || filename;
  return base.slice(0, 18);
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const triggerDownload = (filename: string, content: string): void => {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

class DemoServiceStore {
  private galleries: DemoGalleryState[];
  private user: User;

  constructor() {
    const restored = this.restoreState();
    this.galleries = restored?.galleries || seedState();
    this.user = restored?.user || { ...demoUser };
    this.recalculateStorageUsed();
    if (isDemoModeEnabled()) {
      this.persistState();
    }
  }

  private restoreState(): DemoPersistedState | null {
    if (!isDemoModeEnabled()) return null;
    if (typeof window === 'undefined') return null;

    try {
      const raw = window.localStorage.getItem(DEMO_STATE_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as DemoPersistedState;
      if (!parsed || !Array.isArray(parsed.galleries) || !parsed.user?.id) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private persistState(): void {
    if (!isDemoModeEnabled()) return;
    if (typeof window === 'undefined') return;

    try {
      const state: DemoPersistedState = {
        galleries: this.galleries,
        user: this.user,
      };
      window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage write failures.
    }
  }

  private createNotFoundError(message: string): ApiError {
    return new ApiError(404, message, { detail: message });
  }

  private recalculateStorageUsed() {
    const used = this.galleries
      .flatMap((entry) => entry.photos)
      .reduce((total, photo) => total + (photo.file_size || 0), 0);
    this.user = {
      ...this.user,
      storage_used: used,
    };
  }

  private getGalleryState(galleryId: string): DemoGalleryState {
    const state = this.galleries.find((entry) => entry.gallery.id === galleryId);
    if (!state) {
      throw this.createNotFoundError('Gallery not found');
    }

    return state;
  }

  private filterAndSortPhotos(
    state: DemoGalleryState,
    options?: GalleryPhotoQueryOptions,
  ): GalleryPhoto[] {
    const normalizedSearch = options?.search?.trim().toLowerCase();
    const sortBy: GalleryPhotoSortBy = options?.sort_by ?? 'uploaded_at';
    const order: SortOrder = options?.order ?? 'desc';
    const direction = order === 'asc' ? 1 : -1;

    const filtered = normalizedSearch
      ? state.photos.filter((photo) => photo.filename.toLowerCase().includes(normalizedSearch))
      : [...state.photos];

    return filtered.sort((left, right) => {
      if (sortBy === 'file_size') {
        const sizeDelta = (left.file_size || 0) - (right.file_size || 0);
        if (sizeDelta !== 0) {
          return sizeDelta * direction;
        }
      } else if (sortBy === 'original_filename') {
        const filenameDelta = left.filename.localeCompare(right.filename, undefined, {
          sensitivity: 'base',
          numeric: true,
        });
        if (filenameDelta !== 0) {
          return filenameDelta * direction;
        }
      } else {
        const timeDelta = Date.parse(left.uploaded_at) - Date.parse(right.uploaded_at);
        if (timeDelta !== 0) {
          return timeDelta * direction;
        }
      }

      return left.filename.localeCompare(right.filename, undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    });
  }

  private toGalleryDetail(
    state: DemoGalleryState,
    options?: GalleryPhotoQueryOptions,
  ): GalleryDetail {
    const filteredAndSortedPhotos = this.filterAndSortPhotos(state, options);
    const safeOffset = Math.max(0, options?.offset || 0);
    const sliceEnd = typeof options?.limit === 'number' ? safeOffset + options.limit : undefined;
    const pagePhotos = filteredAndSortedPhotos.slice(safeOffset, sliceEnd);
    const totalSize = state.photos.reduce((sum, photo) => sum + (photo.file_size || 0), 0);

    return {
      ...state.gallery,
      photos: pagePhotos,
      total_photos: filteredAndSortedPhotos.length,
      total_size_bytes: totalSize,
    };
  }

  getDemoUser(): User {
    return { ...this.user };
  }

  getDemoTokens(): AuthTokens {
    return makeDemoTokens();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async login(_: LoginRequest): Promise<LoginResponse> {
    return {
      ...this.user,
      tokens: this.getDemoTokens(),
    };
  }

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    return {
      id: makeDemoId(),
      email: data.email,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refreshToken(_: string): Promise<AuthTokens> {
    return this.getDemoTokens();
  }

  async getCurrentUser(): Promise<User> {
    return this.getDemoUser();
  }

  async updateProfile(data: { display_name: string | null }): Promise<User> {
    this.user = {
      ...this.user,
      display_name: data.display_name,
    };
    this.persistState();
    return this.getDemoUser();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async changePassword(_: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    return { message: 'Password changed in demo mode.' };
  }

  async getGalleries(
    page = 1,
    size = 10,
    options?: GalleryListQueryOptions,
  ): Promise<GalleryListResponse> {
    const start = (page - 1) * size;
    const normalizedSearch = options?.search?.trim().toLowerCase() ?? '';
    const sortBy: GalleryListSortBy = options?.sort_by ?? 'created_at';
    const sortOrder: SortOrder = options?.order ?? 'desc';
    const direction = sortOrder === 'asc' ? 1 : -1;

    const filtered = this.galleries
      .map((entry) => toGalleryWithComputedFields(entry))
      .filter((gallery) => {
        if (!normalizedSearch) {
          return true;
        }
        return gallery.name.toLowerCase().includes(normalizedSearch);
      });

    const sorted = [...filtered].sort((left, right) => {
      if (sortBy === 'name') {
        const delta = left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
          numeric: true,
        });
        if (delta !== 0) return delta * direction;
        return left.id.localeCompare(right.id);
      }

      if (sortBy === 'photo_count') {
        const delta = (left.photo_count ?? 0) - (right.photo_count ?? 0);
        if (delta !== 0) return delta * direction;
        return left.id.localeCompare(right.id);
      }

      if (sortBy === 'total_size_bytes') {
        const delta = (left.total_size_bytes ?? 0) - (right.total_size_bytes ?? 0);
        if (delta !== 0) return delta * direction;
        return left.id.localeCompare(right.id);
      }

      const leftDate = Date.parse(
        sortBy === 'shooting_date' ? left.shooting_date : left.created_at,
      );
      const rightDate = Date.parse(
        sortBy === 'shooting_date' ? right.shooting_date : right.created_at,
      );
      const delta = leftDate - rightDate;
      if (delta !== 0) return delta * direction;
      return left.id.localeCompare(right.id);
    });

    return {
      galleries: sorted.slice(start, start + size),
      total: sorted.length,
      page,
      size,
    };
  }

  async getGallery(galleryId: string, options?: GalleryPhotoQueryOptions): Promise<GalleryDetail> {
    const state = this.getGalleryState(galleryId);
    return this.toGalleryDetail(state, options);
  }

  async createGallery(payload: { name?: string; shooting_date?: string | null }): Promise<Gallery> {
    const createdAt = nowIso();
    const gallery: Gallery = {
      id: makeDemoId(),
      owner_id: DEMO_OWNER_ID,
      name: payload.name?.trim() || 'Untitled Gallery',
      created_at: createdAt,
      shooting_date: payload.shooting_date || createdAt,
      public_sort_by: 'original_filename',
      public_sort_order: 'asc',
      cover_photo_id: null,
      photo_count: 0,
      total_size_bytes: 0,
      has_active_share_links: false,
      cover_photo_thumbnail_url: null,
      recent_photo_thumbnail_urls: [],
    };

    this.galleries.unshift({
      gallery,
      photos: [],
      shareLinks: [],
    });
    this.persistState();

    return toGalleryWithComputedFields(this.galleries[0]);
  }

  async deleteGallery(galleryId: string): Promise<void> {
    this.galleries = this.galleries.filter((entry) => entry.gallery.id !== galleryId);
    this.recalculateStorageUsed();
    this.persistState();
  }

  async updateGallery(
    galleryId: string,
    payload: {
      name?: string;
      shooting_date?: string | null;
      public_sort_by?: GalleryPhotoSortBy;
      public_sort_order?: SortOrder;
    },
  ): Promise<Gallery> {
    const state = this.getGalleryState(galleryId);

    state.gallery = {
      ...state.gallery,
      name: payload.name?.trim() || state.gallery.name,
      shooting_date: payload.shooting_date ?? state.gallery.shooting_date,
      public_sort_by: payload.public_sort_by ?? state.gallery.public_sort_by,
      public_sort_order: payload.public_sort_order ?? state.gallery.public_sort_order,
    };
    this.persistState();

    return toGalleryWithComputedFields(state);
  }

  async setCoverPhoto(galleryId: string, photoId: string): Promise<Gallery> {
    const state = this.getGalleryState(galleryId);
    state.gallery = {
      ...state.gallery,
      cover_photo_id: photoId,
    };
    this.persistState();
    return toGalleryWithComputedFields(state);
  }

  async clearCoverPhoto(galleryId: string): Promise<void> {
    const state = this.getGalleryState(galleryId);
    state.gallery = {
      ...state.gallery,
      cover_photo_id: null,
    };
    this.persistState();
  }

  async getShareLinks(galleryId: string): Promise<ShareLink[]> {
    const state = this.getGalleryState(galleryId);
    return state.shareLinks.map((link) => ({ ...link }));
  }

  async createShareLink(galleryId: string): Promise<ShareLink> {
    const state = this.getGalleryState(galleryId);

    const link: ShareLink = {
      id: `s-${makeDemoId().slice(0, 12)}`,
      label: null,
      is_active: true,
      expires_at: null,
      views: 0,
      zip_downloads: 0,
      single_downloads: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    state.shareLinks.push(link);
    this.persistState();
    return { ...link };
  }

  async updateShareLink(
    galleryId: string,
    shareLinkId: string,
    payload: ShareLinkUpdateRequest,
  ): Promise<ShareLink> {
    const state = this.getGalleryState(galleryId);
    const link = state.shareLinks.find((item) => item.id === shareLinkId);
    if (!link) {
      throw this.createNotFoundError('Share link not found');
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'label')) {
      const normalized = payload.label?.trim();
      link.label = normalized ? normalized : null;
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'is_active') &&
      typeof payload.is_active === 'boolean'
    ) {
      link.is_active = payload.is_active;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'expires_at')) {
      link.expires_at = payload.expires_at ?? null;
    }
    link.updated_at = nowIso();

    this.persistState();
    return { ...link };
  }

  async deleteShareLink(galleryId: string, shareLinkId: string): Promise<void> {
    const state = this.getGalleryState(galleryId);
    state.shareLinks = state.shareLinks.filter((link) => link.id !== shareLinkId);
    this.persistState();
  }

  private findByShareId(shareId: string): DemoGalleryState | null {
    return (
      this.galleries.find((entry) => entry.shareLinks.some((link) => link.id === shareId)) || null
    );
  }

  async getOwnerShareLinks(
    page = 1,
    size = 20,
    search?: string,
  ): Promise<ShareLinksDashboardResponse> {
    const allLinks = this.galleries.flatMap((entry) =>
      entry.shareLinks.map((link) => ({
        ...link,
        gallery_id: entry.gallery.id,
        gallery_name: entry.gallery.name,
      })),
    );

    const normalizedSearch = search?.trim().toLowerCase() || '';
    const filtered = normalizedSearch
      ? allLinks.filter((link) =>
          `${link.label ?? ''} ${link.gallery_name} ${link.id}`
            .toLowerCase()
            .includes(normalizedSearch),
        )
      : allLinks;

    const sorted = filtered.sort(
      (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
    );
    const start = (page - 1) * size;

    const now = Date.now();
    const summary = sorted.reduce(
      (acc, item) => {
        acc.views += item.views || 0;
        acc.zip_downloads += item.zip_downloads || 0;
        acc.single_downloads += item.single_downloads || 0;

        const expiresAt = item.expires_at ? Date.parse(item.expires_at) : null;
        const isExpired = expiresAt !== null && !Number.isNaN(expiresAt) && expiresAt < now;
        if (item.is_active !== false && !isExpired) {
          acc.active_links += 1;
        }

        return acc;
      },
      {
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
        active_links: 0,
      },
    );

    return {
      share_links: sorted.slice(start, start + size),
      total: sorted.length,
      page,
      size,
      summary,
    };
  }

  async getShareLinkAnalytics(shareLinkId: string, days = 30): Promise<ShareLinkAnalyticsResponse> {
    const state = this.findByShareId(shareLinkId);
    if (!state) {
      throw this.createNotFoundError('Share link not found');
    }

    const link = state.shareLinks.find((item) => item.id === shareLinkId);
    if (!link) {
      throw this.createNotFoundError('Share link not found');
    }

    const points: ShareLinkDailyPoint[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const pointDate = new Date();
      pointDate.setDate(pointDate.getDate() - i);
      points.push({
        day: pointDate.toISOString().slice(0, 10),
        views_total: i === 0 ? link.views : 0,
        views_unique: i === 0 ? Math.min(link.views, Math.max(1, Math.floor(link.views * 0.7))) : 0,
        zip_downloads: i === 0 ? link.zip_downloads : 0,
        single_downloads: i === 0 ? link.single_downloads : 0,
      });
    }

    return {
      share_link: {
        ...link,
        gallery_id: state.gallery.id,
        gallery_name: state.gallery.name,
      },
      points,
    };
  }

  private sortSharedPhotos(
    photos: GalleryPhoto[],
    sortBy: GalleryPhotoSortBy,
    order: SortOrder,
  ): GalleryPhoto[] {
    const direction = order === 'asc' ? 1 : -1;

    return [...photos].sort((left, right) => {
      if (sortBy === 'uploaded_at') {
        const timestampDelta = Date.parse(left.uploaded_at) - Date.parse(right.uploaded_at);
        if (timestampDelta !== 0) {
          return timestampDelta * direction;
        }
      } else if (sortBy === 'file_size') {
        const fileSizeDelta = (left.file_size || 0) - (right.file_size || 0);
        if (fileSizeDelta !== 0) {
          return fileSizeDelta * direction;
        }
      } else {
        const filenameDelta = left.filename.localeCompare(right.filename, undefined, {
          sensitivity: 'base',
          numeric: true,
        });
        if (filenameDelta !== 0) {
          return filenameDelta * direction;
        }
      }

      return left.id.localeCompare(right.id);
    });
  }

  async getSharedGallery(
    shareId: string,
    options?: SharedGalleryQueryOptions,
  ): Promise<SharedGallery> {
    const state = this.findByShareId(shareId);
    if (!state) {
      throw this.createNotFoundError('Gallery not found or link expired');
    }

    const shareLink = state.shareLinks.find((link) => link.id === shareId);
    if (shareLink) {
      shareLink.views += 1;
      this.persistState();
    }

    const sortBy: GalleryPhotoSortBy = state.gallery.public_sort_by ?? 'original_filename';
    const sortOrder: SortOrder = state.gallery.public_sort_order ?? 'asc';
    const sortedPhotos = this.sortSharedPhotos(state.photos, sortBy, sortOrder);

    const safeOffset = Math.max(0, options?.offset || 0);
    const limit = options?.limit ?? sortedPhotos.length;
    const photos = sortedPhotos.slice(safeOffset, safeOffset + limit);

    return {
      gallery_name: state.gallery.name,
      photographer: this.user.display_name || this.user.email,
      date: state.gallery.shooting_date,
      site_url: window.location.origin,
      total_photos: sortedPhotos.length,
      cover: state.gallery.cover_photo_id
        ? {
            photo_id: state.gallery.cover_photo_id,
            full_url:
              state.photos.find((photo) => photo.id === state.gallery.cover_photo_id)?.url ||
              state.photos[0]?.url ||
              '',
            thumbnail_url:
              state.photos.find((photo) => photo.id === state.gallery.cover_photo_id)
                ?.thumbnail_url ||
              state.photos[0]?.thumbnail_url ||
              '',
          }
        : null,
      photos: photos.map((photo) => ({
        photo_id: photo.id,
        filename: photo.filename,
        full_url: photo.url,
        thumbnail_url: photo.thumbnail_url,
        width: photo.width,
        height: photo.height,
      })),
    };
  }

  async getPublicPhotoUrl(
    shareId: string,
    photoId: string,
  ): Promise<{ url: string; expires_in: number }> {
    const state = this.findByShareId(shareId);
    if (!state) {
      throw this.createNotFoundError('Share link not found');
    }

    const photo = state.photos.find((item) => item.id === photoId);
    if (!photo) {
      throw this.createNotFoundError('Photo not found');
    }

    return {
      url: photo.url,
      expires_in: 3600,
    };
  }

  async getAllPublicPhotoUrls(shareId: string) {
    const state = this.findByShareId(shareId);
    if (!state) {
      throw this.createNotFoundError('Share link not found');
    }

    return state.photos.map((photo) => ({
      photo_id: photo.id,
      thumbnail_url: photo.thumbnail_url,
      full_url: photo.url,
      filename: photo.filename,
      width: photo.width,
      height: photo.height,
    }));
  }

  async deletePhoto(galleryId: string, photoId: string): Promise<void> {
    await this.deletePhotos(galleryId, [photoId]);
  }

  async deletePhotos(galleryId: string, photoIds: string[]): Promise<BatchDeletePhotosResponse> {
    const state = this.getGalleryState(galleryId);
    if (photoIds.length === 0) {
      return {
        requested_count: 0,
        deleted_ids: [],
        not_found_ids: [],
        failed_ids: [],
      };
    }

    const existingIds = new Set(state.photos.map((photo) => photo.id));
    const deletedIds = photoIds.filter((photoId) => existingIds.has(photoId));
    const notFoundIds = photoIds.filter((photoId) => !existingIds.has(photoId));
    const deletedIdSet = new Set(deletedIds);

    state.photos = state.photos.filter((photo) => !deletedIdSet.has(photo.id));

    if (state.gallery.cover_photo_id && deletedIdSet.has(state.gallery.cover_photo_id)) {
      state.gallery = {
        ...state.gallery,
        cover_photo_id: state.photos[0]?.id ?? null,
      };
    }

    this.recalculateStorageUsed();
    this.persistState();

    return {
      requested_count: photoIds.length,
      deleted_ids: deletedIds,
      not_found_ids: notFoundIds,
      failed_ids: [],
    };
  }

  async renamePhoto(galleryId: string, photoId: string, filename: string): Promise<PhotoResponse> {
    const state = this.getGalleryState(galleryId);
    const existing = state.photos.find((photo) => photo.id === photoId);

    if (!existing) {
      throw this.createNotFoundError('Photo not found');
    }

    existing.filename = filename;
    this.persistState();

    return {
      id: existing.id,
      gallery_id: galleryId,
      filename: existing.filename,
      url: existing.url,
      thumbnail_url: existing.thumbnail_url,
      width: existing.width,
      height: existing.height,
      file_size: existing.file_size,
      uploaded_at: existing.uploaded_at,
    };
  }

  async uploadPhotosPresigned(
    galleryId: string,
    files: UploadPreparedFile[],
    onProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
      currentFile: string;
      successCount: number;
      failedCount: number;
    }) => void,
  ): Promise<PhotoUploadResponse> {
    const state = this.getGalleryState(galleryId);
    const total = files.reduce((sum, item) => sum + item.file.size, 0);
    let loaded = 0;
    let successCount = 0;

    const results = [] as PhotoUploadResponse['results'];

    for (const item of files) {
      await delay(130);
      loaded += item.file.size;

      const created: GalleryPhoto = {
        id: makeDemoId(),
        filename: item.filename,
        url: `https://picsum.photos/seed/${encodeURIComponent(`${item.filename}-${makeDemoId()}`)}/1600/1100`,
        thumbnail_url: `https://picsum.photos/seed/${encodeURIComponent(`${item.filename}-${makeDemoId()}`)}/700/500`,
        width: null,
        height: null,
        file_size: item.file.size,
        uploaded_at: nowIso(),
      };

      state.photos.unshift(created);
      if (!state.gallery.cover_photo_id) {
        state.gallery = {
          ...state.gallery,
          cover_photo_id: created.id,
        };
      }

      successCount += 1;

      onProgress?.({
        loaded,
        total,
        percentage: total > 0 ? Math.round((loaded / total) * 100) : 100,
        currentFile: item.filename,
        successCount,
        failedCount: 0,
      });

      results.push({
        filename: item.filename,
        original_filename: item.filename,
        success: true,
      });
    }

    this.recalculateStorageUsed();
    this.persistState();

    return {
      results,
      total_files: files.length,
      successful_uploads: successCount,
      failed_uploads: 0,
    };
  }

  async retryFailedUploads(
    galleryId: string,
    failedFiles: UploadPreparedFile[],
    onProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
      currentFile: string;
      successCount: number;
      failedCount: number;
    }) => void,
  ): Promise<PhotoUploadResponse> {
    return this.uploadPhotosPresigned(galleryId, failedFiles, onProgress);
  }

  async downloadGalleryZip(galleryId: string): Promise<void> {
    const state = this.getGalleryState(galleryId);
    const lines = state.photos.map((photo) => photo.filename).join('\n');
    triggerDownload(`${parsePhotoIndex(state.gallery.name)}-all-photos.txt`, lines);
  }

  async downloadSelectedPhotosZip(galleryId: string, photoIds: string[]): Promise<void> {
    const state = this.getGalleryState(galleryId);
    const lines = state.photos
      .filter((photo) => photoIds.includes(photo.id))
      .map((photo) => photo.filename)
      .join('\n');
    triggerDownload(`${parsePhotoIndex(state.gallery.name)}-selected-photos.txt`, lines);
  }

  downloadSharedGalleryZip(shareId: string): void {
    const state = this.findByShareId(shareId);
    if (!state) return;

    const link = state.shareLinks.find((item) => item.id === shareId);
    if (link) {
      link.zip_downloads += 1;
      this.persistState();
    }

    const lines = state.photos.map((photo) => photo.filename).join('\n');
    triggerDownload(`${parsePhotoIndex(state.gallery.name)}-public-gallery.txt`, lines);
  }
}

let demoServiceStore: DemoServiceStore | null = null;

export const getDemoService = (): DemoServiceStore => {
  if (!demoServiceStore) {
    demoServiceStore = new DemoServiceStore();
  }

  return demoServiceStore;
};
