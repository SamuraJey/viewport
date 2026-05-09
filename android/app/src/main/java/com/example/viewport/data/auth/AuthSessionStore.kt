package com.example.viewport.data.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.viewport.data.api.LoginResponse
import com.example.viewport.data.api.MeResponse
import com.example.viewport.data.api.TokenPair
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "viewport_auth")

data class AuthSession(
  val accessToken: String? = null,
  val refreshToken: String? = null,
  val user: MeResponse? = null,
) {
  val isAuthenticated: Boolean = !accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()
}

class AuthSessionStore(context: Context) {
  private val dataStore = context.applicationContext.authDataStore

  val session: Flow<AuthSession> =
    dataStore.data.map { prefs ->
      val userId = prefs[USER_ID]
      AuthSession(
        accessToken = prefs[ACCESS_TOKEN],
        refreshToken = prefs[REFRESH_TOKEN],
        user =
          if (userId != null) {
            MeResponse(
              id = userId,
              email = prefs[USER_EMAIL].orEmpty(),
              displayName = prefs[USER_DISPLAY_NAME],
              storageUsed = prefs[USER_STORAGE_USED] ?: 0,
              storageQuota = prefs[USER_STORAGE_QUOTA] ?: 0,
            )
          } else {
            null
          },
      )
    }

  suspend fun currentAccessToken(): String? = dataStore.data.first()[ACCESS_TOKEN]

  suspend fun currentRefreshToken(): String? = dataStore.data.first()[REFRESH_TOKEN]

  suspend fun saveLogin(response: LoginResponse) {
    dataStore.edit { prefs ->
      prefs[ACCESS_TOKEN] = response.tokens.accessToken
      prefs[REFRESH_TOKEN] = response.tokens.refreshToken
      prefs[USER_ID] = response.id
      prefs[USER_EMAIL] = response.email
      response.displayName?.let { prefs[USER_DISPLAY_NAME] = it } ?: prefs.remove(USER_DISPLAY_NAME)
      prefs[USER_STORAGE_USED] = response.storageUsed
      prefs[USER_STORAGE_QUOTA] = response.storageQuota
    }
  }

  suspend fun saveTokens(tokens: TokenPair) {
    dataStore.edit { prefs ->
      prefs[ACCESS_TOKEN] = tokens.accessToken
      prefs[REFRESH_TOKEN] = tokens.refreshToken
    }
  }

  suspend fun saveUser(user: MeResponse) {
    dataStore.edit { prefs ->
      prefs[USER_ID] = user.id
      prefs[USER_EMAIL] = user.email
      user.displayName?.let { prefs[USER_DISPLAY_NAME] = it } ?: prefs.remove(USER_DISPLAY_NAME)
      prefs[USER_STORAGE_USED] = user.storageUsed
      prefs[USER_STORAGE_QUOTA] = user.storageQuota
    }
  }

  suspend fun clear() {
    dataStore.edit { it.clear() }
  }

  private companion object {
    val ACCESS_TOKEN = stringPreferencesKey("access_token")
    val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    val USER_ID = stringPreferencesKey("user_id")
    val USER_EMAIL = stringPreferencesKey("user_email")
    val USER_DISPLAY_NAME = stringPreferencesKey("user_display_name")
    val USER_STORAGE_USED = longPreferencesKey("user_storage_used")
    val USER_STORAGE_QUOTA = longPreferencesKey("user_storage_quota")
  }
}
