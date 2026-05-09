package com.example.viewport

import android.content.Context
import com.example.viewport.data.auth.AuthSessionStore
import com.example.viewport.data.network.ViewportApiClient
import com.example.viewport.data.repository.ViewportRepository

class AppContainer(context: Context) {
  val sessionStore = AuthSessionStore(context)
  val apiClient = ViewportApiClient(sessionStore)
  val repository = ViewportRepository(apiClient, sessionStore)
}
