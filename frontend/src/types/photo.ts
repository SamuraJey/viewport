/**
 * Photo-related types
 */
export interface PhotoResponse {
  id: string;
  gallery_id: string;
  url: string;
  thumbnail_url: string;
  filename: string;
  file_size: number;
  uploaded_at: string;
}

export type GalleryPhoto = Omit<PhotoResponse, 'gallery_id'>;

export interface PhotoUploadResult {
  filename: string;
  original_filename?: string;
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

export interface BatchDeletePhotosRequest {
  photo_ids: string[];
}

export interface BatchDeletePhotosResponse {
  requested_count: number;
  deleted_ids: string[];
  not_found_ids: string[];
  failed_ids: string[];
}

export interface UploadPreparedFile {
  file: File;
  filename: string;
  presigned_data?: PresignedUploadData;
  photo_id?: string;
  presigned_expires_at?: number;
  _presignError?: string;
}

export interface UploadRenameWarning {
  original: string;
  unique: string;
}
