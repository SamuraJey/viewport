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
  GalleryListSortBy,
  GalleryListQueryOptions,
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
  ShareLinkAnalyticsItem,
  ShareLinkSelectionSummary,
  ShareLinksDashboardSummary,
  ShareLinksDashboardResponse,
  ShareLinkDailyPoint,
  ShareLinkAnalyticsResponse,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
  SharedGalleryQueryOptions,
  SelectionConfig,
  SelectionConfigUpdateRequest,
  SelectionSessionStartRequest,
  SelectionSessionUpdateRequest,
  SelectionPhotoCommentRequest,
  SelectionItem,
  SelectionSession,
  SelectionToggleResponse,
  SelectionSubmitResponse,
  OwnerSelectionRow,
  OwnerSelectionAggregate,
  OwnerSelectionSessionListItem,
  OwnerSelectionDetail,
  BulkSelectionActionResponse,
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
