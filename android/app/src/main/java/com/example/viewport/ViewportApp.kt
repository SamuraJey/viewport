package com.example.viewport

import android.app.Application

class ViewportApp : Application() {
  lateinit var container: AppContainer
    private set

  override fun onCreate() {
    super.onCreate()
    container = AppContainer(this)
  }
}
