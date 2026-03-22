/**
 * Gallery-related types
 */

import type { GalleryPhoto } from './photo';

export interface Gallery {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  shooting_date: string;
  cover_photo_id?: string | null;
}

export interface GalleryDetail extends Gallery {
  photos: GalleryPhoto[];
  total_photos: number;
  total_size_bytes?: number;
}

export interface GalleryListResponse {
  galleries: Gallery[];
  total: number;
  page: number;
  size: number;
}
