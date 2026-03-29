/**
 * Centralized type exports for the Viewport frontend
 */

// Common types
export type { PaginatedResponse, ApiError, AsyncState } from './common';

// Gallery types
export type {
  Gallery,
  GalleryDetail,
  GalleryListResponse,
  GalleryPhotoSortBy,
  SortOrder,
  GalleryPhotoQueryOptions,
} from './gallery';

// Photo types
export type {
  PhotoResponse,
  GalleryPhoto,
  PhotoUploadResult,
  PhotoUploadResponse,
  PhotoUploadIntentRequest,
  PresignedUploadData,
  BatchPresignedUploadItem,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadRequest,
  BatchConfirmUploadResponse,
  BatchDeletePhotosRequest,
  BatchDeletePhotosResponse,
  UploadPreparedFile,
  UploadRenameWarning,
} from './photo';

// Share link types
export type {
  ShareLink,
  ShareLinkDashboardItem,
  ShareLinksDashboardSummary,
  ShareLinksDashboardResponse,
  ShareLinkDailyPoint,
  ShareLinkAnalyticsResponse,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
  SharedGalleryQueryOptions,
} from './sharelink';

// Auth types
export type {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
} from './auth';
