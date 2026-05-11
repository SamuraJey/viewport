package com.example.viewport

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.viewport.theme.MyApplicationTheme
import com.example.viewport.ui.ViewportRoot

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    val container = (application as ViewportApp).container
    setContent {
      val viewModel: ViewportViewModel = viewModel(factory = ViewportViewModel.Factory(container.repository))
      val state by viewModel.uiState.collectAsStateWithLifecycle()
      MyApplicationTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          ViewportRoot(state, viewModel)
        }
      }
    }
  }
}
