/**
 * Gallery-related types
 */

import type { GalleryPhoto } from './photo';

export type GalleryPhotoSortBy = 'uploaded_at' | 'original_filename' | 'file_size';
export type SortOrder = 'asc' | 'desc';
export type GalleryListSortBy =
  | 'created_at'
  | 'shooting_date'
  | 'name'
  | 'photo_count'
  | 'total_size_bytes';

export interface GalleryPhotoQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  sort_by?: GalleryPhotoSortBy;
  order?: SortOrder;
}

export interface GalleryListQueryOptions {
  search?: string;
  sort_by?: GalleryListSortBy;
  order?: SortOrder;
}

export interface Gallery {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  shooting_date: string;
  public_sort_by: GalleryPhotoSortBy;
  public_sort_order: SortOrder;
  cover_photo_id?: string | null;
  photo_count: number;
  total_size_bytes: number;
  has_active_share_links: boolean;
  cover_photo_thumbnail_url?: string | null;
  recent_photo_thumbnail_urls: string[];
}

export interface GalleryDetail extends Gallery {
  private_notes?: string | null;
  public_description?: string | null;
  photos: GalleryPhoto[];
  total_photos: number;
}

export interface GalleryListResponse {
  galleries: Gallery[];
  total: number;
  page: number;
  size: number;
}
