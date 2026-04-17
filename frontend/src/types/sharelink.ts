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
  selection_summary: ShareLinkSelectionSummary;
}

export interface ShareLinkAnalyticsItem extends ShareLink {
  gallery_id: string;
  gallery_name: string;
}

export interface ShareLinkSelectionSummary {
  is_enabled: boolean;
  status: string;
  total_sessions: number;
  submitted_sessions: number;
  in_progress_sessions: number;
  closed_sessions: number;
  selected_count: number;
  latest_activity_at: string | null;
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
  share_link: ShareLinkAnalyticsItem;
  selection_summary: ShareLinkSelectionSummary;
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
  public_description?: string | null;
  date?: string;
  site_url?: string;
  total_photos?: number;
}

export interface SelectionConfig {
  is_enabled: boolean;
  list_title: string;
  limit_enabled: boolean;
  limit_value: number | null;
  allow_photo_comments: boolean;
  require_name: boolean;
  require_email: boolean;
  require_phone: boolean;
  require_client_note: boolean;
  created_at: string;
  updated_at: string;
}

export interface SelectionConfigUpdateRequest {
  is_enabled?: boolean;
  list_title?: string;
  limit_enabled?: boolean;
  limit_value?: number | null;
  allow_photo_comments?: boolean;
  require_email?: boolean;
  require_phone?: boolean;
  require_client_note?: boolean;
}

export interface SelectionSessionStartRequest {
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  client_note?: string | null;
}

export interface SelectionSessionUpdateRequest {
  client_note?: string | null;
}

export interface SelectionPhotoCommentRequest {
  comment?: string | null;
}

export interface SelectionItem {
  photo_id: string;
  photo_display_name?: string | null;
  photo_thumbnail_url?: string | null;
  comment: string | null;
  selected_at: string;
  updated_at: string;
}

export interface SelectionSession {
  id: string;
  sharelink_id: string;
  status: 'in_progress' | 'submitted' | 'closed' | string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_note: string | null;
  selected_count: number;
  submitted_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  resume_token?: string | null;
  items: SelectionItem[];
}

export interface SelectionToggleResponse {
  selected: boolean;
  selected_count: number;
  limit_enabled: boolean;
  limit_value: number | null;
}

export interface SelectionSubmitResponse {
  status: string;
  selected_count: number;
  submitted_at: string;
  notification_enqueued: boolean;
}

export interface OwnerSelectionRow {
  sharelink_id: string;
  sharelink_label: string | null;
  session_id: string | null;
  status: string | null;
  client_name: string | null;
  selected_count: number;
  session_count: number;
  submitted_sessions: number;
  in_progress_sessions: number;
  closed_sessions: number;
  submitted_at: string | null;
  updated_at: string;
}

export interface OwnerSelectionAggregate {
  total_sessions: number;
  submitted_sessions: number;
  in_progress_sessions: number;
  closed_sessions: number;
  selected_count: number;
  latest_activity_at: string | null;
}

export interface OwnerSelectionSessionListItem {
  id: string;
  status: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_note: string | null;
  selected_count: number;
  submitted_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface OwnerSelectionDetail {
  sharelink_id: string;
  sharelink_label: string | null;
  config: SelectionConfig;
  aggregate: OwnerSelectionAggregate;
  sessions: OwnerSelectionSessionListItem[];
  session: SelectionSession | null;
}

export interface BulkSelectionActionResponse {
  affected_count: number;
}
