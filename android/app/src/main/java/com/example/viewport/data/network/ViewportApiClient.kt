package com.example.viewport.data.network

import com.example.viewport.BuildConfig
import com.example.viewport.data.api.RefreshRequest
import com.example.viewport.data.api.ViewportApi
import com.example.viewport.data.auth.AuthSessionStore
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class ViewportApiClient(
  private val sessionStore: AuthSessionStore,
  baseUrl: String = BuildConfig.API_BASE_URL,
) {
  val normalizedBaseUrl: String = baseUrl.trimEnd('/') + "/"

  private val logging = HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE }

  private val publicClient: OkHttpClient =
    OkHttpClient.Builder()
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(120, TimeUnit.SECONDS)
      .writeTimeout(120, TimeUnit.SECONDS)
      .addInterceptor(logging)
      .build()

  val publicApi: ViewportApi = retrofit(publicClient).create(ViewportApi::class.java)

  private val authenticatedClient: OkHttpClient =
    publicClient
      .newBuilder()
      .addInterceptor(AuthHeaderInterceptor(sessionStore))
      .authenticator(TokenRefreshAuthenticator(sessionStore, publicApi))
      .build()

  val api: ViewportApi = retrofit(authenticatedClient).create(ViewportApi::class.java)

  fun absoluteUrl(path: String): String = normalizedBaseUrl + path.trimStart('/')

  private fun retrofit(client: OkHttpClient): Retrofit =
    Retrofit.Builder()
      .baseUrl(normalizedBaseUrl)
      .client(client)
      .addConverterFactory(GsonConverterFactory.create())
      .build()
}

private class AuthHeaderInterceptor(private val sessionStore: AuthSessionStore) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val token = runBlocking { sessionStore.currentAccessToken() }
    val request =
      if (token.isNullOrBlank()) {
        chain.request()
      } else {
        chain.request().newBuilder().header("Authorization", "Bearer $token").build()
      }
    return chain.proceed(request)
  }
}

private class TokenRefreshAuthenticator(
  private val sessionStore: AuthSessionStore,
  private val authApi: ViewportApi,
) : Authenticator {
  override fun authenticate(route: Route?, response: Response): Request? {
    if (responseCount(response) >= 2 || response.request.url.encodedPath.endsWith("/auth/refresh")) {
      runBlocking { sessionStore.clear() }
      return null
    }

    val refreshToken = runBlocking { sessionStore.currentRefreshToken() } ?: return null
    val newTokens =
      try {
        authApi.refreshBlocking(RefreshRequest(refreshToken)).execute().body()
      } catch (_: Exception) {
        null
      } ?: run {
        runBlocking { sessionStore.clear() }
        return null
      }

    runBlocking { sessionStore.saveTokens(newTokens) }
    return response.request.newBuilder().header("Authorization", "Bearer ${newTokens.accessToken}").build()
  }

  private fun responseCount(response: Response): Int {
    var count = 1
    var prior = response.priorResponse
    while (prior != null) {
      count++
      prior = prior.priorResponse
    }
    return count
  }
}
