/**
 * Gallery-related types
 */

import type { PhotoResponse } from './photo';
import type { ShareLink } from './sharelink';

export interface Gallery {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  shooting_date: string;
  cover_photo_id?: string | null;
}

export interface GalleryDetail extends Gallery {
  photos: PhotoResponse[];
  share_links: ShareLink[];
  total_photos: number;
}

export interface GalleryListResponse {
  galleries: Gallery[];
  total: number;
  page: number;
  size: number;
}
