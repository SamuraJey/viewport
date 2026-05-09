package com.example.viewport

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.viewport.data.api.GalleryDetailResponse
import com.example.viewport.data.api.GalleryPhotoResponse
import com.example.viewport.data.api.GalleryUpdateRequest
import com.example.viewport.data.api.MeResponse
import com.example.viewport.data.api.ProjectDetailResponse
import com.example.viewport.data.api.ProjectResponse
import com.example.viewport.data.api.ShareLinkResponse
import com.example.viewport.data.auth.AuthSession
import com.example.viewport.data.repository.ViewportRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface OwnerScreen {
  data object Projects : OwnerScreen
  data object ShareLinks : OwnerScreen
  data object Profile : OwnerScreen
  data class Project(val projectId: String) : OwnerScreen
  data class Gallery(val galleryId: String, val projectId: String?) : OwnerScreen
}

data class AppUiState(
  val sessionChecked: Boolean = false,
  val authSession: AuthSession = AuthSession(),
  val user: MeResponse? = null,
  val screen: OwnerScreen = OwnerScreen.Projects,
  val isLoading: Boolean = false,
  val message: String? = null,
  val error: String? = null,
  val projectSearch: String = "",
  val projectSortBy: String = "created_at",
  val projectOrder: String = "desc",
  val projects: List<ProjectResponse> = emptyList(),
  val selectedProject: ProjectDetailResponse? = null,
  val selectedGallery: GalleryDetailResponse? = null,
  val projectShareLinks: List<ShareLinkResponse> = emptyList(),
  val galleryShareLinks: List<ShareLinkResponse> = emptyList(),
  val ownerShareLinks: List<ShareLinkResponse> = emptyList(),
) {
  val isAuthenticated: Boolean = authSession.isAuthenticated
}

class ViewportViewModel(private val repository: ViewportRepository) : ViewModel() {
  private val _uiState = MutableStateFlow(AppUiState())
  val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()

  init {
    viewModelScope.launch {
      repositorySession().collectLatest { session ->
        _uiState.update { it.copy(authSession = session, sessionChecked = true, user = session.user) }
        if (session.isAuthenticated && _uiState.value.projects.isEmpty()) {
          refreshAfterAuth()
        }
      }
    }
  }

  private fun repositorySession() = repository.session

  fun clearMessage() = _uiState.update { it.copy(message = null, error = null) }

  fun login(email: String, password: String) = runAction(success = "Logged in") {
    repository.login(email.trim(), password)
    refreshAfterAuth()
  }

  fun register(email: String, password: String, inviteCode: String) = runAction(success = "Account created. You can sign in now.") {
    repository.register(email.trim(), password, inviteCode.trim())
  }

  fun logout() = runAction { repository.logout(); _uiState.value = AppUiState(sessionChecked = true) }

  fun loadProjects(search: String = _uiState.value.projectSearch, sortBy: String = _uiState.value.projectSortBy, order: String = _uiState.value.projectOrder) = runAction {
    val response = repository.projects(search = search.ifBlank { null }, sortBy = sortBy, order = order)
    _uiState.update { it.copy(projects = response.projects, projectSearch = search, projectSortBy = sortBy, projectOrder = order) }
  }

  fun openProjects() {
    _uiState.update { it.copy(screen = OwnerScreen.Projects, selectedProject = null, selectedGallery = null) }
    loadProjects()
  }

  fun openShareLinks() {
    _uiState.update { it.copy(screen = OwnerScreen.ShareLinks) }
    loadOwnerShareLinks()
  }

  fun openProfile() {
    _uiState.update { it.copy(screen = OwnerScreen.Profile) }
    loadMe()
  }

  fun navigateBack(): Boolean {
    when (val screen = _uiState.value.screen) {
      is OwnerScreen.Gallery -> if (screen.projectId != null) openProject(screen.projectId) else openProjects()
      is OwnerScreen.Project, OwnerScreen.Profile, OwnerScreen.ShareLinks -> openProjects()
      OwnerScreen.Projects -> return false
    }
    return true
  }

  fun createProject(name: String, shootingDate: String?) = runAction(success = "Project created") {
    repository.createProject(name.trim(), shootingDate.blankToNull())
    loadProjects()
  }

  fun updateProject(projectId: String, name: String, shootingDate: String?) = runAction(success = "Project updated") {
    repository.updateProject(projectId, name.blankToNull(), shootingDate.blankToNull())
    openProject(projectId)
  }

  fun deleteProject(projectId: String) = runAction(success = "Project deleted") {
    repository.deleteProject(projectId)
    openProjects()
  }

  fun openProject(projectId: String) = runAction {
    val project = repository.project(projectId)
    val links = repository.projectShareLinks(projectId)
    _uiState.update { it.copy(screen = OwnerScreen.Project(projectId), selectedProject = project, projectShareLinks = links, selectedGallery = null) }
  }

  fun createGallery(projectId: String, name: String, visibility: String) = runAction(success = "Gallery created") {
    repository.createGallery(projectId, name.trim(), visibility)
    openProject(projectId)
  }

  fun updateGalleryVisibility(galleryId: String, visibility: String) = runAction(success = "Gallery updated") {
    repository.updateGallery(galleryId, GalleryUpdateRequest(projectVisibility = visibility))
    _uiState.value.selectedProject?.id?.let { openProject(it) }
  }

  fun deleteGallery(projectId: String, galleryId: String) = runAction(success = "Gallery deleted") {
    repository.deleteGallery(galleryId)
    openProject(projectId)
  }

  fun openGallery(galleryId: String, projectId: String? = _uiState.value.selectedProject?.id, search: String? = null) = runAction {
    val gallery = repository.gallery(galleryId, search = search.blankToNull())
    val links = repository.galleryShareLinks(galleryId)
    _uiState.update { it.copy(screen = OwnerScreen.Gallery(galleryId, projectId), selectedGallery = gallery, galleryShareLinks = links) }
  }

  fun renamePhoto(galleryId: String, photoId: String, filename: String) = runAction(success = "Photo renamed") {
    repository.renamePhoto(galleryId, photoId, filename.trim())
    openGallery(galleryId)
  }

  fun deletePhoto(galleryId: String, photoId: String) = runAction(success = "Photo deleted") {
    repository.deletePhotos(galleryId, listOf(photoId))
    openGallery(galleryId)
  }

  fun setCover(galleryId: String, photoId: String) = runAction(success = "Cover updated") {
    repository.setCover(galleryId, photoId)
    openGallery(galleryId)
  }

  fun enqueueUpload(context: Context, galleryId: String, uris: List<Uri>) = runAction(success = "Upload queued") {
    repository.enqueuePhotoUpload(context.applicationContext, galleryId, uris)
  }

  fun downloadGallery(context: Context, galleryId: String) = runAction(success = "Download started") {
    repository.enqueueDownload(context.applicationContext, "/galleries/$galleryId/download/all", "gallery_$galleryId.zip")
  }

  fun downloadPhoto(context: Context, photo: GalleryPhotoResponse) = runAction(success = "Download started") {
    repository.enqueuePresignedDownload(context.applicationContext, photo.url, photo.filename)
  }

  fun downloadProject(context: Context, projectId: String) = runAction(success = "Download started") {
    repository.enqueueDownload(context.applicationContext, "/projects/$projectId/download/all", "project_$projectId.zip")
  }

  fun createGalleryShareLink(galleryId: String, label: String, password: String?) = runAction(success = "Share link created") {
    repository.createGalleryShareLink(galleryId, label, password)
    openGallery(galleryId)
  }

  fun createProjectShareLink(projectId: String, label: String, password: String?) = runAction(success = "Share link created") {
    repository.createProjectShareLink(projectId, label, password)
    openProject(projectId)
  }

  fun toggleGalleryShareLink(galleryId: String, link: ShareLinkResponse) = runAction(success = "Share link updated") {
    repository.toggleGalleryShareLink(galleryId, link)
    openGallery(galleryId)
  }

  fun toggleProjectShareLink(projectId: String, link: ShareLinkResponse) = runAction(success = "Share link updated") {
    repository.toggleProjectShareLink(projectId, link)
    openProject(projectId)
  }

  fun deleteGalleryShareLink(galleryId: String, linkId: String) = runAction(success = "Share link deleted") {
    repository.deleteGalleryShareLink(galleryId, linkId)
    openGallery(galleryId)
  }

  fun deleteProjectShareLink(projectId: String, linkId: String) = runAction(success = "Share link deleted") {
    repository.deleteProjectShareLink(projectId, linkId)
    openProject(projectId)
  }

  fun loadOwnerShareLinks() = runAction {
    val dashboard = repository.ownerShareLinks()
    _uiState.update { it.copy(ownerShareLinks = dashboard.shareLinks) }
  }

  fun loadMe() = runAction { _uiState.update { it.copy(user = repository.me()) } }

  fun updateProfile(displayName: String?) = runAction(success = "Profile updated") { _uiState.update { it.copy(user = repository.updateProfile(displayName.blankToNull())) } }

  fun changePassword(current: String, new: String) = runAction(success = "Password changed") { repository.changePassword(current, new) }

  private suspend fun refreshAfterAuth() {
    val user = repository.me()
    val projects = repository.projects().projects
    _uiState.update { it.copy(user = user, projects = projects, screen = OwnerScreen.Projects) }
  }

  private fun runAction(success: String? = null, block: suspend () -> Unit) {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null, message = null) }
      try {
        block()
        _uiState.update { it.copy(isLoading = false, message = success) }
      } catch (throwable: Throwable) {
        _uiState.update { it.copy(isLoading = false, error = throwable.userMessage()) }
      }
    }
  }

  class Factory(private val repository: ViewportRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ViewportViewModel(repository) as T
  }
}

private fun String?.blankToNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

private fun Throwable.userMessage(): String = message ?: javaClass.simpleName
