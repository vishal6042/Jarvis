package com.jarvis.sync.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BrandPurple = Color(0xFF7C5CFF)
private val BrandPurpleDark = Color(0xFF9E86FF)

private val LightColors = lightColorScheme(
    primary = BrandPurple,
    secondary = Color(0xFF6D5DD3),
    background = Color(0xFFF7F5FF),
    surface = Color(0xFFFFFFFF),
)

private val DarkColors = darkColorScheme(
    primary = BrandPurpleDark,
    secondary = Color(0xFFB4A4FF),
    background = Color(0xFF0B0B12),
    surface = Color(0xFF15151F),
)

@Composable
fun JarvisSyncTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, typography = Typography(), content = content)
}
