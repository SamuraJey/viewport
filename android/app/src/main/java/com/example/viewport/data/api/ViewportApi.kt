package com.example.viewport.data.api

import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface ViewportApi {
  @POST("auth/login") suspend fun login(@Body request: LoginRequest): LoginResponse

  @POST("auth/register") suspend fun register(@Body request: RegisterRequest): RegisterResponse

  @POST("auth/refresh") suspend fun refresh(@Body request: RefreshRequest): TokenPair

  @POST("auth/refresh") fun refreshBlocking(@Body request: RefreshRequest): Call<TokenPair>

  @GET("me") suspend fun me(): MeResponse

  @PUT("me") suspend fun updateMe(@Body request: UpdateMeRequest): MeResponse

  @PUT("me/password") suspend fun changePassword(@Body request: ChangePasswordRequest): MessageResponse

  @GET("projects") suspend fun projects(
    @Query("page") page: Int = 1,
    @Query("size") size: Int = 20,
    @Query("search") search: String? = null,
    @Query("sort_by") sortBy: String = "created_at",
    @Query("order") order: String = "desc",
  ): ProjectListResponse

  @POST("projects") suspend fun createProject(@Body request: ProjectCreateRequest): ProjectResponse

  @GET("projects/{projectId}") suspend fun project(@Path("projectId") projectId: String): ProjectDetailResponse

  @PATCH("projects/{projectId}") suspend fun updateProject(@Path("projectId") projectId: String, @Body request: ProjectUpdateRequest): ProjectResponse

  @DELETE("projects/{projectId}") suspend fun deleteProject(@Path("projectId") projectId: String): Response<Unit>

  @PUT("projects/{projectId}/galleries/reorder") suspend fun reorderProjectGalleries(
    @Path("projectId") projectId: String,
    @Body request: ProjectGalleryReorderRequest,
  ): Response<Unit>

  @POST("projects/{projectId}/galleries") suspend fun createProjectGallery(
    @Path("projectId") projectId: String,
    @Body request: GalleryCreateRequest,
  ): ProjectGallerySummaryResponse

  @GET("galleries") suspend fun galleries(
    @Query("page") page: Int = 1,
    @Query("size") size: Int = 20,
    @Query("search") search: String? = null,
    @Query("sort_by") sortBy: String = "created_at",
    @Query("order") order: String = "desc",
    @Query("project_id") projectId: String? = null,
  ): GalleryListResponse

  @GET("galleries/{galleryId}") suspend fun gallery(
    @Path("galleryId") galleryId: String,
    @Query("limit") limit: Int? = 100,
    @Query("offset") offset: Int = 0,
    @Query("search") search: String? = null,
    @Query("sort_by") sortBy: String? = null,
    @Query("order") order: String? = null,
  ): GalleryDetailResponse

  @PATCH("galleries/{galleryId}") suspend fun updateGallery(@Path("galleryId") galleryId: String, @Body request: GalleryUpdateRequest): GalleryResponse

  @DELETE("galleries/{galleryId}") suspend fun deleteGallery(@Path("galleryId") galleryId: String): Response<Unit>

  @POST("galleries/{galleryId}/cover/{photoId}") suspend fun setGalleryCover(@Path("galleryId") galleryId: String, @Path("photoId") photoId: String): GalleryResponse

  @DELETE("galleries/{galleryId}/cover") suspend fun clearGalleryCover(@Path("galleryId") galleryId: String): Response<Unit>

  @POST("galleries/{galleryId}/photos/batch-presigned") suspend fun createUploadIntents(
    @Path("galleryId") galleryId: String,
    @Body request: BatchPresignedUploadsRequest,
  ): BatchPresignedUploadsResponse

  @POST("galleries/{galleryId}/photos/batch-confirm") suspend fun confirmUploads(
    @Path("galleryId") galleryId: String,
    @Body request: BatchConfirmUploadRequest,
  ): BatchConfirmUploadResponse

  @HTTP(method = "DELETE", path = "galleries/{galleryId}/photos", hasBody = true)
  suspend fun deletePhotos(@Path("galleryId") galleryId: String, @Body request: BatchDeletePhotosRequest): BatchDeletePhotosResponse

  @PATCH("galleries/{galleryId}/photos/{photoId}/rename") suspend fun renamePhoto(
    @Path("galleryId") galleryId: String,
    @Path("photoId") photoId: String,
    @Body request: PhotoRenameRequest,
  ): PhotoResponse

  @GET("galleries/{galleryId}/share-links") suspend fun galleryShareLinks(@Path("galleryId") galleryId: String): List<ShareLinkResponse>

  @POST("galleries/{galleryId}/share-links") suspend fun createGalleryShareLink(
    @Path("galleryId") galleryId: String,
    @Body request: ShareLinkCreateRequest,
  ): ShareLinkResponse

  @PATCH("galleries/{galleryId}/share-links/{shareLinkId}") suspend fun updateGalleryShareLink(
    @Path("galleryId") galleryId: String,
    @Path("shareLinkId") shareLinkId: String,
    @Body request: ShareLinkUpdateRequest,
  ): ShareLinkResponse

  @DELETE("galleries/{galleryId}/share-links/{shareLinkId}") suspend fun deleteGalleryShareLink(
    @Path("galleryId") galleryId: String,
    @Path("shareLinkId") shareLinkId: String,
  ): Response<Unit>

  @GET("projects/{projectId}/share-links") suspend fun projectShareLinks(@Path("projectId") projectId: String): List<ShareLinkResponse>

  @POST("projects/{projectId}/share-links") suspend fun createProjectShareLink(
    @Path("projectId") projectId: String,
    @Body request: ShareLinkCreateRequest,
  ): ShareLinkResponse

  @PATCH("projects/{projectId}/share-links/{shareLinkId}") suspend fun updateProjectShareLink(
    @Path("projectId") projectId: String,
    @Path("shareLinkId") shareLinkId: String,
    @Body request: ShareLinkUpdateRequest,
  ): ShareLinkResponse

  @DELETE("projects/{projectId}/share-links/{shareLinkId}") suspend fun deleteProjectShareLink(
    @Path("projectId") projectId: String,
    @Path("shareLinkId") shareLinkId: String,
  ): Response<Unit>

  @GET("share-links") suspend fun ownerShareLinks(
    @Query("page") page: Int = 1,
    @Query("size") size: Int = 50,
    @Query("search") search: String? = null,
    @Query("status") status: String? = null,
  ): ShareLinkDashboardResponse

  @Streaming @GET("galleries/{galleryId}/download/all") suspend fun downloadGallery(@Path("galleryId") galleryId: String): Response<ResponseBody>

  @Streaming @POST("galleries/{galleryId}/download/selected") suspend fun downloadSelectedPhotos(
    @Path("galleryId") galleryId: String,
    @Body request: DownloadSelectedPhotosRequest,
  ): Response<ResponseBody>

  @Streaming @GET("projects/{projectId}/download/all") suspend fun downloadProject(@Path("projectId") projectId: String): Response<ResponseBody>
}
