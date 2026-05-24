/**
 * Centralized type exports for the Viewport frontend
 */

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

export type {
  Project,
  ProjectDetail,
  ProjectGallerySummary,
  ProjectListQueryOptions,
  ProjectListResponse,
  ProjectListSortBy,
  CreateProjectRequest,
  UpdateProjectRequest,
} from './project';

// Photo types
export type {
  PhotoResponse,
  GalleryPhoto,
  PhotoUploadResult,
  PhotoUploadResponse,
  BatchPresignedUploadsRequest,
  BatchPresignedUploadsResponse,
  ConfirmPhotoUploadItem,
  BatchConfirmUploadResponse,
  BatchDeletePhotosRequest,
  BatchDeletePhotosResponse,
  UploadPreparedFile,
  UploadRenameWarning,
} from './photo';

// Share link types
export type {
  ShareScopeType,
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
  PublicProjectGallery,
  SharedGallery,
  SharedProjectShare,
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
