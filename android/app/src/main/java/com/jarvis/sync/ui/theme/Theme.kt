@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.jarvis.sync.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextMotion
import androidx.compose.ui.unit.em
import com.jarvis.sync.R

/**
 * One ground, one accent.
 *
 * <p>Colour here carries exactly one meaning: [Ink.out] is money leaving, [Ink.in_] is money
 * arriving, and the violet is the app itself. Everything else is the neutral ramp. The screens
 * before this gave every figure its own tinted gradient card, which put six competing colours on
 * one page and left the numbers as the quietest thing on it.
 */
object Ink {
    /** The page. */
    val ground = Color(0xFF0B0B12)

    /** A card or a row group sitting on the ground. */
    val surface = Color(0xFF14141D)

    /** A band that separates one part of a list from the next. */
    val band = Color(0xFF101019)

    /** The bar along the bottom, a shade off the ground so it reads as chrome. */
    val chrome = Color(0xFF0F0F17)

    /** A filled control or avatar well — lighter than a card, still not white. */
    val well = Color(0xFF1C1C28)

    /** The track behind a bar or a toggle. */
    val track = Color(0xFF23232F)

    val hairline = Color(0x12FFFFFF)
    val hairlineStrong = Color(0x1FFFFFFF)

    val text = Color(0xFFECECF2)
    val muted = Color(0xFF9A9AAE)
    val dim = Color(0xFF6B6B80)
    val faint = Color(0xFF4E4E60)

    /** The brand, and the only thing that wears it. */
    val accent = Color(0xFF7C5CFF)
    val accentLift = Color(0xFF9E86FF)
    val accentSoft = Color(0xFFB9A8FF)
    val accentWell = Color(0xFF221B4A)

    /** Money out. */
    val out = Color(0xFFF5647E)

    /** Money in, and anything filling up: a goal, a balance climbing. */
    val in_ = Color(0xFF3DD68C)

    /** Reserved for a second series on a chart or a second card's edge — never decoration. */
    val alt = Color(0xFF60A5FA)
}

/**
 * Manrope, one variable file for every weight (165 KB against roughly half a megabyte of static
 * cuts). The weight axis needs API 26, which is this app's floor.
 */
private val Manrope = FontFamily(
    Font(R.font.manrope, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.manrope, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.manrope, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.manrope, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(R.font.manrope, FontWeight.ExtraBold, variationSettings = FontVariation.Settings(FontVariation.weight(800))),
)

/**
 * An amount, in the one style every amount in the app wears: tight tracking so long rupee figures
 * stay compact, and animated motion so a number that changes does not shimmer as it re-lays out.
 */
val MoneyStyle = TextStyle(
    fontFamily = Manrope,
    fontWeight = FontWeight.Bold,
    letterSpacing = (-0.02).em,
    textMotion = TextMotion.Animated,
)

private val JarvisType = Typography().let { base ->
    Typography(
        displayLarge = base.displayLarge.copy(fontFamily = Manrope),
        displayMedium = base.displayMedium.copy(fontFamily = Manrope),
        displaySmall = base.displaySmall.copy(fontFamily = Manrope),
        headlineLarge = base.headlineLarge.copy(fontFamily = Manrope),
        headlineMedium = base.headlineMedium.copy(fontFamily = Manrope),
        headlineSmall = base.headlineSmall.copy(fontFamily = Manrope),
        titleLarge = base.titleLarge.copy(fontFamily = Manrope),
        titleMedium = base.titleMedium.copy(fontFamily = Manrope),
        titleSmall = base.titleSmall.copy(fontFamily = Manrope),
        bodyLarge = base.bodyLarge.copy(fontFamily = Manrope),
        bodyMedium = base.bodyMedium.copy(fontFamily = Manrope),
        bodySmall = base.bodySmall.copy(fontFamily = Manrope),
        labelLarge = base.labelLarge.copy(fontFamily = Manrope),
        labelMedium = base.labelMedium.copy(fontFamily = Manrope),
        labelSmall = base.labelSmall.copy(fontFamily = Manrope),
    )
}

/**
 * Dark only, deliberately. A money app is read at night on a phone in bed as often as anywhere
 * else, and one ground is one set of decisions to get right rather than two.
 */
private val Colors = darkColorScheme(
    primary = Ink.accentLift,
    onPrimary = Ink.ground,
    secondary = Ink.accentSoft,
    background = Ink.ground,
    onBackground = Ink.text,
    surface = Ink.surface,
    onSurface = Ink.text,
    surfaceVariant = Ink.well,
    onSurfaceVariant = Ink.muted,
    outline = Ink.hairlineStrong,
    outlineVariant = Ink.hairline,
    error = Ink.out,
    onError = Ink.ground,
)

@Composable
fun JarvisSyncTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = JarvisType, content = content)
}
