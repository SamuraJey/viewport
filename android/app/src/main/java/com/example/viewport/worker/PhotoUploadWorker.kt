package com.example.viewport.worker

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.viewport.data.api.BatchConfirmUploadRequest
import com.example.viewport.data.api.BatchPresignedUploadsRequest
import com.example.viewport.data.api.ConfirmPhotoUploadItem
import com.example.viewport.data.api.PhotoUploadIntentRequest
import com.example.viewport.data.api.PresignedUploadData
import com.example.viewport.data.auth.AuthSessionStore
import com.example.viewport.data.network.ViewportApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import retrofit2.HttpException
import java.io.IOException

class PhotoUploadWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  private val sessionStore = AuthSessionStore(appContext)
  private val apiClient = ViewportApiClient(sessionStore)
  private val s3Client = OkHttpClient.Builder().build()

  override suspend fun doWork(): Result =
    withContext(Dispatchers.IO) {
      val galleryId = inputData.getString(KEY_GALLERY_ID) ?: return@withContext Result.failure()
      val uris = inputData.getStringArray(KEY_URIS)?.map(Uri::parse).orEmpty()
      if (uris.isEmpty()) return@withContext Result.failure()

      try {
        val files = uris.map { uri -> applicationContext.contentResolver.describeUpload(uri) }
        val intents =
          apiClient.api.createUploadIntents(
            galleryId,
            BatchPresignedUploadsRequest(files.map { PhotoUploadIntentRequest(it.filename, it.size, it.contentType) }),
          )

        val successful = mutableListOf<String>()
        val failed = mutableListOf<String>()
        intents.items.forEachIndexed { index, item ->
          val photoId = item.photoId
          val presignedData = item.presignedData
          if (!item.success || photoId == null || presignedData == null) {
            photoId?.let(failed::add)
            return@forEachIndexed
          }

          val upload = files[index]
          try {
            uploadToS3(upload.uri, upload.contentType, upload.size, presignedData)
            successful += photoId
          } catch (_: Exception) {
            failed += photoId
          }
        }

        if (successful.isNotEmpty() || failed.isNotEmpty()) {
          apiClient.api.confirmUploads(
            galleryId,
            BatchConfirmUploadRequest(successful.map { ConfirmPhotoUploadItem(it, true) } + failed.map { ConfirmPhotoUploadItem(it, false) }),
          )
        }

        if (failed.isEmpty()) Result.success() else Result.retry()
      } catch (http: HttpException) {
        if (http.code() in 500..599) Result.retry() else Result.failure()
      } catch (_: IOException) {
        Result.retry()
      } catch (_: Exception) {
        Result.failure()
      }
    }

  private fun uploadToS3(uri: Uri, contentType: String, contentLength: Long, presignedData: PresignedUploadData) {
    val body = ContentUriRequestBody(applicationContext, uri, contentType, contentLength)
    val requestBuilder = Request.Builder().url(presignedData.url).put(body)
    presignedData.headers.forEach { (name, value) ->
      if (!name.equals("content-length", ignoreCase = true)) requestBuilder.header(name, value)
    }
    s3Client.newCall(requestBuilder.build()).execute().use { response ->
      if (!response.isSuccessful) throw IOException("S3 upload failed: ${response.code}")
    }
  }

  data class UploadFile(val uri: Uri, val filename: String, val size: Long, val contentType: String)

  companion object {
    const val KEY_GALLERY_ID = "gallery_id"
    const val KEY_URIS = "uris"
    private const val MAX_UPLOAD_BYTES = 10L * 1024L * 1024L
  }

  private fun android.content.ContentResolver.describeUpload(uri: Uri): UploadFile {
    val nameAndSize = query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null).useNameAndSize(uri)
    val contentType = getType(uri)?.takeIf { it == "image/jpeg" || it == "image/jpg" || it == "image/png" } ?: guessContentType(nameAndSize.first)
    if (nameAndSize.second <= 0) throw IllegalArgumentException("File is empty")
    if (nameAndSize.second > MAX_UPLOAD_BYTES) throw IllegalArgumentException("File exceeds 10MB")
    return UploadFile(uri, nameAndSize.first, nameAndSize.second, contentType)
  }

  private fun Cursor?.useNameAndSize(uri: Uri): Pair<String, Long> {
    this?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        val name = if (nameIndex >= 0) cursor.getString(nameIndex) else null
        val size = if (sizeIndex >= 0) cursor.getLong(sizeIndex) else -1L
        return (name ?: uri.lastPathSegment ?: "photo.jpg") to size
      }
    }
    return (uri.lastPathSegment ?: "photo.jpg") to -1L
  }

  private fun guessContentType(filename: String): String =
    when (filename.substringAfterLast('.', missingDelimiterValue = "").lowercase()) {
      "png" -> "image/png"
      "jpg", "jpeg" -> "image/jpeg"
      else -> throw IllegalArgumentException("Unsupported file type")
    }
}

private class ContentUriRequestBody(
  private val context: Context,
  private val uri: Uri,
  private val contentType: String,
  private val contentLength: Long,
) : RequestBody() {
  override fun contentType() = contentType.toMediaTypeOrNull()

  override fun contentLength() = contentLength

  override fun writeTo(sink: BufferedSink) {
    context.contentResolver.openInputStream(uri)?.use { input -> sink.writeAll(input.source()) } ?: throw IOException("Cannot open $uri")
  }
}
