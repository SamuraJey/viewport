package com.example.viewport.data.repository

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.example.viewport.data.api.BatchDeletePhotosRequest
import com.example.viewport.data.api.ChangePasswordRequest
import com.example.viewport.data.api.GalleryCreateRequest
import com.example.viewport.data.api.GalleryDetailResponse
import com.example.viewport.data.api.GalleryResponse
import com.example.viewport.data.api.GalleryUpdateRequest
import com.example.viewport.data.api.LoginRequest
import com.example.viewport.data.api.LoginResponse
import com.example.viewport.data.api.MeResponse
import com.example.viewport.data.api.PhotoRenameRequest
import com.example.viewport.data.api.ProjectCreateRequest
import com.example.viewport.data.api.ProjectDetailResponse
import com.example.viewport.data.api.ProjectGallerySummaryResponse
import com.example.viewport.data.api.ProjectListResponse
import com.example.viewport.data.api.ProjectResponse
import com.example.viewport.data.api.ProjectUpdateRequest
import com.example.viewport.data.api.RegisterRequest
import com.example.viewport.data.api.ShareLinkCreateRequest
import com.example.viewport.data.api.ShareLinkDashboardResponse
import com.example.viewport.data.api.ShareLinkResponse
import com.example.viewport.data.api.ShareLinkUpdateRequest
import com.example.viewport.data.api.UpdateMeRequest
import com.example.viewport.data.auth.AuthSessionStore
import com.example.viewport.data.network.ViewportApiClient
import com.example.viewport.worker.PhotoUploadWorker
import kotlinx.coroutines.flow.first
import retrofit2.HttpException
import java.util.UUID

class ViewportRepository(
  private val apiClient: ViewportApiClient,
  private val sessionStore: AuthSessionStore,
) {
  private val api = apiClient.api
  private val publicApi = apiClient.publicApi
  val session = sessionStore.session

  suspend fun login(email: String, password: String): LoginResponse {
    val response = publicApi.login(LoginRequest(email, password))
    sessionStore.saveLogin(response)
    return response
  }

  suspend fun register(email: String, password: String, inviteCode: String) = publicApi.register(RegisterRequest(email, password, inviteCode))

  suspend fun logout() = sessionStore.clear()

  suspend fun me(): MeResponse = api.me().also { sessionStore.saveUser(it) }

  suspend fun updateProfile(displayName: String?): MeResponse = api.updateMe(UpdateMeRequest(displayName)).also { sessionStore.saveUser(it) }

  suspend fun changePassword(current: String, new: String) {
    api.changePassword(ChangePasswordRequest(current, new, new))
  }

  suspend fun projects(page: Int = 1, search: String? = null, sortBy: String = "created_at", order: String = "desc"): ProjectListResponse = api.projects(page = page, search = search, sortBy = sortBy, order = order)

  suspend fun project(projectId: String): ProjectDetailResponse = api.project(projectId)

  suspend fun createProject(name: String, shootingDate: String? = null): ProjectResponse = api.createProject(ProjectCreateRequest(name, shootingDate))

  suspend fun updateProject(projectId: String, name: String? = null, shootingDate: String? = null): ProjectResponse = api.updateProject(projectId, ProjectUpdateRequest(name, shootingDate))

  suspend fun deleteProject(projectId: String) = api.deleteProject(projectId).ensureSuccess()

  suspend fun createGallery(projectId: String, name: String, visibility: String): ProjectGallerySummaryResponse =
    api.createProjectGallery(projectId, GalleryCreateRequest(name = name, projectId = projectId, projectVisibility = visibility))

  suspend fun updateGallery(galleryId: String, request: GalleryUpdateRequest): GalleryResponse = api.updateGallery(galleryId, request)

  suspend fun deleteGallery(galleryId: String) = api.deleteGallery(galleryId).ensureSuccess()

  suspend fun gallery(galleryId: String, search: String? = null, sortBy: String? = null, order: String? = null): GalleryDetailResponse =
    api.gallery(galleryId, limit = 250, search = search, sortBy = sortBy, order = order)

  suspend fun renamePhoto(galleryId: String, photoId: String, filename: String) = api.renamePhoto(galleryId, photoId, PhotoRenameRequest(filename))

  suspend fun deletePhotos(galleryId: String, photoIds: List<String>) = api.deletePhotos(galleryId, BatchDeletePhotosRequest(photoIds))

  suspend fun setCover(galleryId: String, photoId: String) = api.setGalleryCover(galleryId, photoId)

  suspend fun galleryShareLinks(galleryId: String): List<ShareLinkResponse> = api.galleryShareLinks(galleryId)

  suspend fun projectShareLinks(projectId: String): List<ShareLinkResponse> = api.projectShareLinks(projectId)

  suspend fun ownerShareLinks(): ShareLinkDashboardResponse = api.ownerShareLinks()

  suspend fun createGalleryShareLink(galleryId: String, label: String?, password: String?) = api.createGalleryShareLink(galleryId, ShareLinkCreateRequest(label = label.blankToNull(), password = password.blankToNull()))

  suspend fun createProjectShareLink(projectId: String, label: String?, password: String?) = api.createProjectShareLink(projectId, ShareLinkCreateRequest(label = label.blankToNull(), password = password.blankToNull()))

  suspend fun toggleGalleryShareLink(galleryId: String, link: ShareLinkResponse) = api.updateGalleryShareLink(galleryId, link.id, ShareLinkUpdateRequest(isActive = !link.isActive))

  suspend fun toggleProjectShareLink(projectId: String, link: ShareLinkResponse) = api.updateProjectShareLink(projectId, link.id, ShareLinkUpdateRequest(isActive = !link.isActive))

  suspend fun clearGalleryShareLinkPassword(galleryId: String, linkId: String) = api.updateGalleryShareLink(galleryId, linkId, ShareLinkUpdateRequest(passwordClear = true))

  suspend fun clearProjectShareLinkPassword(projectId: String, linkId: String) = api.updateProjectShareLink(projectId, linkId, ShareLinkUpdateRequest(passwordClear = true))

  suspend fun deleteGalleryShareLink(galleryId: String, linkId: String) = api.deleteGalleryShareLink(galleryId, linkId).ensureSuccess()

  suspend fun deleteProjectShareLink(projectId: String, linkId: String) = api.deleteProjectShareLink(projectId, linkId).ensureSuccess()

  suspend fun enqueueDownload(context: Context, path: String, filename: String): Long {
    val accessToken = sessionStore.session.first().accessToken ?: throw IllegalStateException("Not authenticated")
    val request =
      DownloadManager.Request(Uri.parse(apiClient.absoluteUrl(path)))
        .setTitle(filename)
        .setDescription("Viewport download")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, filename)
        .addRequestHeader("Authorization", "Bearer $accessToken")
    val manager = context.getSystemService(DownloadManager::class.java)
    return manager.enqueue(request)
  }

  fun enqueuePresignedDownload(context: Context, url: String, filename: String): Long {
    val safeFilename = filename.safeDownloadName("photo.jpg")
    val request =
      DownloadManager.Request(Uri.parse(url))
        .setTitle(safeFilename)
        .setDescription("Viewport photo download")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, safeFilename)
    val manager = context.getSystemService(DownloadManager::class.java)
    return manager.enqueue(request)
  }

  fun enqueuePhotoUpload(context: Context, galleryId: String, uris: List<Uri>): UUID {
    val workId = UUID.randomUUID()
    val data =
      Data.Builder()
        .putString(PhotoUploadWorker.KEY_GALLERY_ID, galleryId)
        .putStringArray(PhotoUploadWorker.KEY_URIS, uris.map(Uri::toString).toTypedArray())
        .build()
    val request =
      OneTimeWorkRequestBuilder<PhotoUploadWorker>()
        .setId(workId)
        .setInputData(data)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork("upload-$galleryId-$workId", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    return workId
  }

  private fun retrofit2.Response<Unit>.ensureSuccess() {
    if (!isSuccessful) throw HttpException(this)
  }
}

private fun String?.blankToNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

private fun String.safeDownloadName(fallback: String): String =
  replace(Regex("""[\\/:*?"<>|]"""), "_")
    .trim()
    .take(127)
    .ifBlank { fallback }
