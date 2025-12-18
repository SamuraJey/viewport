/**
 * Share link and public gallery types
 */

export interface ShareLink {
  id: string;
  gallery_id: string;
  expires_at: string | null;
  views: number;
  zip_downloads: number;
  single_downloads: number;
  created_at: string;
}

export interface PublicPhoto {
  photo_id: string;
  thumbnail_url: string;
  full_url: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SharedGallery {
  photos: PublicPhoto[];
  cover?: { photo_id: string; full_url: string; thumbnail_url: string } | null;
  photographer?: string;
  gallery_name?: string;
  date?: string;
  site_url?: string;
}
