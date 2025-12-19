/**
 * Photo-related types
 */

export interface PhotoResponse {
  id: string;
  gallery_id: string;
  url: string;
  thumbnail_url: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  file_size: number;
  uploaded_at: string;
}

export interface PhotoUrlResponse {
  id: string;
  url: string;
  expires_in: number;
}

export interface PhotoUploadResult {
  filename: string;
  success: boolean;
  error?: string;
  photo?: PhotoResponse;
}

export interface PhotoUploadResponse {
  results: PhotoUploadResult[];
  total_files: number;
  successful_uploads: number;
  failed_uploads: number;
}
