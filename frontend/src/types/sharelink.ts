/**
 * Share link and public gallery types
 */

export interface ShareLink {
  id: string;
  label?: string | null;
  is_active?: boolean;
  expires_at: string | null;
  views: number;
  zip_downloads: number;
  single_downloads: number;
  created_at: string;
  updated_at?: string;
}

export interface ShareLinkDashboardItem extends ShareLink {
  gallery_id: string;
  gallery_name: string;
}

export interface ShareLinksDashboardSummary {
  views: number;
  zip_downloads: number;
  single_downloads: number;
  active_links: number;
}

export interface ShareLinksDashboardResponse {
  share_links: ShareLinkDashboardItem[];
  total: number;
  page: number;
  size: number;
  summary: ShareLinksDashboardSummary;
}

export interface ShareLinkDailyPoint {
  day: string;
  views_total: number;
  views_unique: number;
  zip_downloads: number;
  single_downloads: number;
}

export interface ShareLinkAnalyticsResponse {
  share_link: ShareLinkDashboardItem;
  points: ShareLinkDailyPoint[];
}

export interface ShareLinkUpdateRequest {
  label?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
}

export interface ShareLinkCreateRequest {
  label?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
}

export interface PublicPhoto {
  photo_id: string;
  thumbnail_url: string;
  full_url: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SharedGalleryQueryOptions {
  limit?: number;
  offset?: number;
}

export interface SharedGallery {
  photos: PublicPhoto[];
  cover?: { photo_id: string; full_url: string; thumbnail_url: string } | null;
  photographer?: string;
  gallery_name?: string;
  date?: string;
  site_url?: string;
  total_photos?: number;
}
