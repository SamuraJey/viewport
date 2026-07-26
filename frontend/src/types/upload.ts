export type UploadStatus = 'queued' | 'uploading' | 'success' | 'failed';

export interface UploadJob {
  id: string;
  file: File;
  filename: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  retryable?: boolean;
  renameWarning?: string;
}
