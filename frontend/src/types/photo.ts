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

export interface PhotoUploadResult {
  filename: string;
  success: boolean;
  error?: string;
  photo?: PhotoResponse;
  retryable?: boolean;
}

export interface PhotoUploadResponse {
  results: PhotoUploadResult[];
  total_files: number;
  successful_uploads: number;
  failed_uploads: number;
}

// Presigned upload types
export interface PhotoUploadIntentRequest {
  filename: string;
  file_size: number;
  content_type: string;
}

export interface PresignedUploadData {
  url: string;
  headers: Record<string, string>;
}

// Batch presigned upload types
export interface BatchPresignedUploadItem {
  filename: string;
  file_size: number;
  success: boolean;
  error?: string;
  photo_id?: string;
  presigned_data?: PresignedUploadData;
  expires_in?: number;
}

export interface BatchPresignedUploadsResponse {
  items: BatchPresignedUploadItem[];
}

export interface BatchPresignedUploadsRequest {
  files: PhotoUploadIntentRequest[];
}

export interface ConfirmPhotoUploadItem {
  photo_id: string;
  success?: boolean;
}

export interface BatchConfirmUploadRequest {
  items: ConfirmPhotoUploadItem[];
}

export interface BatchConfirmUploadResponse {
  confirmed_count: number;
  failed_count: number;
}
