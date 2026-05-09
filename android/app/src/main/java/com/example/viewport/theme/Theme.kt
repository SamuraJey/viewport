package com.example.viewport.theme

import android.annotation.SuppressLint
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme =
  darkColorScheme(
    primary = Gold80,
    onPrimary = Color(0xFF3E2D00),
    primaryContainer = Color(0xFF4B3910),
    onPrimaryContainer = Color(0xFFF7E1AC),
    secondary = Sage80,
    tertiary = Rose80,
    background = DarkBackground,
    onBackground = Color(0xFFF3F0EA),
    surface = DarkSurface,
    onSurface = Color(0xFFF3F0EA),
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = Color(0xFFC8C6D0),
    outline = Color(0xFF8F8D98),
    error = Color(0xFFFFB4AB),
  )

private val LightColorScheme =
  lightColorScheme(
    primary = Gold40,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDFA0),
    onPrimaryContainer = Color(0xFF241A00),
    secondary = Sage40,
    tertiary = Rose40,
    background = LightBackground,
    onBackground = Color(0xFF211E1A),
    surface = LightSurface,
    onSurface = Color(0xFF211E1A),
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = Color(0xFF4F463C),
    outline = Color(0xFF817568),
  )

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  // Dynamic color is available on Android 12+
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme =
    when {
      dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        dynamicViewportColorScheme(darkTheme)
      }
      darkTheme -> DarkColorScheme
      else -> LightColorScheme
    }

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}

@RequiresApi(Build.VERSION_CODES.S)
@SuppressLint("NewApi")
@Composable
private fun dynamicViewportColorScheme(darkTheme: Boolean): ColorScheme {
  val context = LocalContext.current
  return if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
}
