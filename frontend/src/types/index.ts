/**
 * Centralized type exports for the Viewport frontend
 */

// Common types
export type { PaginatedResponse, ApiError, AsyncState } from './common';

// Gallery types
export type { Gallery, GalleryDetail, GalleryListResponse } from './gallery';

// Photo types
export type {
  PhotoResponse,
  PhotoUrlResponse,
  PhotoUploadResult,
  PhotoUploadResponse,
  PhotoUploadIntentRequest,
  PresignedUploadData,
  PhotoUploadIntentResponse,
  PhotoConfirmUploadResponse,
  BatchPresignedUploadItem,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadRequest,
  BatchConfirmUploadResponse,
} from './photo';

// Share link types
export type { ShareLink, PublicPhoto, SharedGallery } from './sharelink';

// Auth types
export type {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
} from './auth';
