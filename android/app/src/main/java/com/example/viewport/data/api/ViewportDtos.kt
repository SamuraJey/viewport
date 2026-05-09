package com.example.viewport.data.api

import com.google.gson.annotations.SerializedName

// Auth / profile

data class RegisterRequest(
  val email: String,
  val password: String,
  @SerializedName("invite_code") val inviteCode: String,
)

data class RegisterResponse(val id: String, val email: String)

data class LoginRequest(val email: String, val password: String)

data class TokenPair(
  @SerializedName("access_token") val accessToken: String,
  @SerializedName("refresh_token") val refreshToken: String,
  @SerializedName("token_type") val tokenType: String = "bearer",
)

data class LoginResponse(
  val id: String,
  val email: String,
  @SerializedName("display_name") val displayName: String? = null,
  @SerializedName("storage_used") val storageUsed: Long = 0,
  @SerializedName("storage_quota") val storageQuota: Long = 0,
  val tokens: TokenPair,
)

data class RefreshRequest(@SerializedName("refresh_token") val refreshToken: String)

data class MeResponse(
  val id: String,
  val email: String,
  @SerializedName("display_name") val displayName: String? = null,
  @SerializedName("storage_used") val storageUsed: Long = 0,
  @SerializedName("storage_quota") val storageQuota: Long = 0,
)

data class UpdateMeRequest(@SerializedName("display_name") val displayName: String?)

data class ChangePasswordRequest(
  @SerializedName("current_password") val currentPassword: String,
  @SerializedName("new_password") val newPassword: String,
  @SerializedName("confirm_password") val confirmPassword: String,
)

data class MessageResponse(val message: String? = null)

// Common owner domain

typealias IsoDate = String
typealias IsoDateTime = String

data class ProjectCreateRequest(val name: String = "", @SerializedName("shooting_date") val shootingDate: IsoDate? = null)

data class ProjectUpdateRequest(val name: String? = null, @SerializedName("shooting_date") val shootingDate: IsoDate? = null)

data class ProjectGalleryReorderRequest(@SerializedName("gallery_ids") val galleryIds: List<String>)

data class ProjectResponse(
  val id: String,
  @SerializedName("owner_id") val ownerId: String,
  val name: String,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("shooting_date") val shootingDate: IsoDate,
  @SerializedName("gallery_count") val galleryCount: Int = 0,
  @SerializedName("visible_gallery_count") val visibleGalleryCount: Int = 0,
  @SerializedName("entry_gallery_id") val entryGalleryId: String? = null,
  @SerializedName("entry_gallery_name") val entryGalleryName: String? = null,
  @SerializedName("has_entry_gallery") val hasEntryGallery: Boolean = false,
  @SerializedName("total_photo_count") val totalPhotoCount: Int = 0,
  @SerializedName("total_size_bytes") val totalSizeBytes: Long = 0,
  @SerializedName("has_active_share_links") val hasActiveShareLinks: Boolean = false,
  @SerializedName("cover_photo_thumbnail_url") val coverPhotoThumbnailUrl: String? = null,
)

data class ProjectDetailResponse(
  val id: String,
  @SerializedName("owner_id") val ownerId: String,
  val name: String,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("shooting_date") val shootingDate: IsoDate,
  @SerializedName("gallery_count") val galleryCount: Int = 0,
  @SerializedName("visible_gallery_count") val visibleGalleryCount: Int = 0,
  @SerializedName("entry_gallery_id") val entryGalleryId: String? = null,
  @SerializedName("entry_gallery_name") val entryGalleryName: String? = null,
  @SerializedName("has_entry_gallery") val hasEntryGallery: Boolean = false,
  @SerializedName("total_photo_count") val totalPhotoCount: Int = 0,
  @SerializedName("total_size_bytes") val totalSizeBytes: Long = 0,
  @SerializedName("has_active_share_links") val hasActiveShareLinks: Boolean = false,
  @SerializedName("cover_photo_thumbnail_url") val coverPhotoThumbnailUrl: String? = null,
  val galleries: List<ProjectGallerySummaryResponse> = emptyList(),
)

data class ProjectListResponse(val projects: List<ProjectResponse>, val total: Int, val page: Int, val size: Int)

data class GalleryCreateRequest(
  val name: String = "",
  @SerializedName("shooting_date") val shootingDate: IsoDate? = null,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("project_position") val projectPosition: Int? = null,
  @SerializedName("project_visibility") val projectVisibility: String = "listed",
  @SerializedName("public_sort_by") val publicSortBy: String = "original_filename",
  @SerializedName("public_sort_order") val publicSortOrder: String = "asc",
)

data class GalleryUpdateRequest(
  val name: String? = null,
  @SerializedName("shooting_date") val shootingDate: IsoDate? = null,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("project_position") val projectPosition: Int? = null,
  @SerializedName("project_visibility") val projectVisibility: String? = null,
  @SerializedName("public_sort_by") val publicSortBy: String? = null,
  @SerializedName("public_sort_order") val publicSortOrder: String? = null,
)

interface GallerySummaryFields {
  val id: String
  val name: String
  val photoCount: Int
  val totalSizeBytes: Long
  val coverPhotoThumbnailUrl: String?
}

data class GalleryResponse(
  override val id: String,
  @SerializedName("owner_id") val ownerId: String,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("project_name") val projectName: String? = null,
  @SerializedName("project_position") val projectPosition: Int = 0,
  @SerializedName("project_visibility") val projectVisibility: String = "listed",
  override val name: String,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("shooting_date") val shootingDate: IsoDate,
  @SerializedName("public_sort_by") val publicSortBy: String = "original_filename",
  @SerializedName("public_sort_order") val publicSortOrder: String = "asc",
  @SerializedName("cover_photo_id") val coverPhotoId: String? = null,
  @SerializedName("photo_count") override val photoCount: Int = 0,
  @SerializedName("total_size_bytes") override val totalSizeBytes: Long = 0,
  @SerializedName("has_active_share_links") val hasActiveShareLinks: Boolean = false,
  @SerializedName("cover_photo_thumbnail_url") override val coverPhotoThumbnailUrl: String? = null,
) : GallerySummaryFields

data class ProjectGallerySummaryResponse(
  override val id: String,
  @SerializedName("owner_id") val ownerId: String,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("project_name") val projectName: String? = null,
  @SerializedName("project_position") val projectPosition: Int = 0,
  @SerializedName("project_visibility") val projectVisibility: String = "listed",
  override val name: String,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("shooting_date") val shootingDate: IsoDate,
  @SerializedName("cover_photo_id") val coverPhotoId: String? = null,
  @SerializedName("photo_count") override val photoCount: Int = 0,
  @SerializedName("total_size_bytes") override val totalSizeBytes: Long = 0,
  @SerializedName("has_active_share_links") val hasActiveShareLinks: Boolean = false,
  @SerializedName("cover_photo_thumbnail_url") override val coverPhotoThumbnailUrl: String? = null,
) : GallerySummaryFields

data class GalleryDetailResponse(
  val id: String,
  @SerializedName("owner_id") val ownerId: String,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("project_name") val projectName: String? = null,
  @SerializedName("project_position") val projectPosition: Int = 0,
  @SerializedName("project_visibility") val projectVisibility: String = "listed",
  val name: String,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("shooting_date") val shootingDate: IsoDate,
  @SerializedName("public_sort_by") val publicSortBy: String = "original_filename",
  @SerializedName("public_sort_order") val publicSortOrder: String = "asc",
  @SerializedName("cover_photo_id") val coverPhotoId: String? = null,
  @SerializedName("photo_count") val photoCount: Int = 0,
  @SerializedName("has_active_share_links") val hasActiveShareLinks: Boolean = false,
  @SerializedName("cover_photo_thumbnail_url") val coverPhotoThumbnailUrl: String? = null,
  val photos: List<GalleryPhotoResponse> = emptyList(),
  @SerializedName("total_photos") val totalPhotos: Int = 0,
  @SerializedName("total_size_bytes") val totalSizeBytes: Long = 0,
)

data class GalleryListResponse(val galleries: List<GalleryResponse>, val total: Int, val page: Int, val size: Int)

data class GalleryPhotoResponse(
  val id: String,
  val url: String,
  @SerializedName("thumbnail_url") val thumbnailUrl: String,
  val filename: String,
  @SerializedName("file_size") val fileSize: Long,
  @SerializedName("uploaded_at") val uploadedAt: IsoDateTime,
)

data class PhotoResponse(
  val id: String,
  @SerializedName("gallery_id") val galleryId: String,
  val url: String,
  @SerializedName("thumbnail_url") val thumbnailUrl: String,
  val filename: String,
  @SerializedName("file_size") val fileSize: Long,
  @SerializedName("uploaded_at") val uploadedAt: IsoDateTime,
)

data class PhotoRenameRequest(val filename: String)

data class PhotoUploadIntentRequest(val filename: String, @SerializedName("file_size") val fileSize: Long, @SerializedName("content_type") val contentType: String)

data class PresignedUploadData(val url: String, val headers: Map<String, String> = emptyMap())

data class BatchPresignedUploadItem(
  val filename: String,
  @SerializedName("file_size") val fileSize: Long,
  val success: Boolean,
  val error: String? = null,
  @SerializedName("photo_id") val photoId: String? = null,
  @SerializedName("presigned_data") val presignedData: PresignedUploadData? = null,
  @SerializedName("expires_in") val expiresIn: Int? = null,
)

data class BatchPresignedUploadsRequest(val files: List<PhotoUploadIntentRequest>)

data class BatchPresignedUploadsResponse(val items: List<BatchPresignedUploadItem>)

data class ConfirmPhotoUploadItem(@SerializedName("photo_id") val photoId: String, val success: Boolean = true)

data class BatchConfirmUploadRequest(val items: List<ConfirmPhotoUploadItem>)

data class BatchConfirmUploadResponse(@SerializedName("confirmed_count") val confirmedCount: Int, @SerializedName("failed_count") val failedCount: Int)

data class BatchDeletePhotosRequest(@SerializedName("photo_ids") val photoIds: List<String>)

data class BatchDeletePhotosResponse(
  @SerializedName("requested_count") val requestedCount: Int,
  @SerializedName("deleted_ids") val deletedIds: List<String>,
  @SerializedName("not_found_ids") val notFoundIds: List<String>,
  @SerializedName("failed_ids") val failedIds: List<String>,
)

data class DownloadSelectedPhotosRequest(@SerializedName("photo_ids") val photoIds: List<String>)

data class ShareLinkCreateRequest(
  val label: String? = null,
  @SerializedName("expires_at") val expiresAt: IsoDateTime? = null,
  @SerializedName("is_active") val isActive: Boolean = true,
  val password: String? = null,
)

data class ShareLinkUpdateRequest(
  val label: String? = null,
  @SerializedName("expires_at") val expiresAt: IsoDateTime? = null,
  @SerializedName("is_active") val isActive: Boolean? = null,
  val password: String? = null,
  @SerializedName("password_clear") val passwordClear: Boolean? = null,
)

data class ShareLinkResponse(
  val id: String,
  @SerializedName("scope_type") val scopeType: String = "gallery",
  @SerializedName("gallery_id") val galleryId: String? = null,
  @SerializedName("project_id") val projectId: String? = null,
  @SerializedName("gallery_name") val galleryName: String? = null,
  @SerializedName("project_name") val projectName: String? = null,
  @SerializedName("cover_photo_thumbnail_url") val coverPhotoThumbnailUrl: String? = null,
  val label: String? = null,
  @SerializedName("expires_at") val expiresAt: IsoDateTime? = null,
  @SerializedName("is_active") val isActive: Boolean = true,
  val views: Int = 0,
  @SerializedName("zip_downloads") val zipDownloads: Int = 0,
  @SerializedName("single_downloads") val singleDownloads: Int = 0,
  @SerializedName("has_password") val hasPassword: Boolean = false,
  @SerializedName("created_at") val createdAt: IsoDateTime,
  @SerializedName("updated_at") val updatedAt: IsoDateTime,
  @SerializedName("latest_activity_at") val latestActivityAt: IsoDateTime? = null,
)

data class ShareLinkDashboardSummaryResponse(
  val views: Int = 0,
  @SerializedName("zip_downloads") val zipDownloads: Int = 0,
  @SerializedName("single_downloads") val singleDownloads: Int = 0,
  @SerializedName("active_links") val activeLinks: Int = 0,
)

data class ShareLinkDashboardResponse(
  @SerializedName("share_links") val shareLinks: List<ShareLinkResponse>,
  val total: Int,
  val page: Int,
  val size: Int,
  val summary: ShareLinkDashboardSummaryResponse,
)
