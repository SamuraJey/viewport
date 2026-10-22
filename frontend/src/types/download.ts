export type DownloadQuality = 'original' | 'publication';

export interface DownloadOptions {
  quality: DownloadQuality;
  includeVideos: boolean;
}

export interface DownloadEstimate {
  image_count: number;
  video_count: number;
  available_video_count: number;
  original_size_bytes: number;
  publication_size_bytes: number | null;
  publication_pending_count: number;
}

export interface PublicationRequestResponse {
  requested_count: number;
  skipped_count: number;
}
