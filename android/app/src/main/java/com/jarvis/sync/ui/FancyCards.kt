package com.jarvis.sync.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Palettes for the tinted cards (dark-first, like the web Accounts page). */
object CardTints {
    val savings = listOf(Color(0xFF0B3D2E), Color(0xFF062A1F))
    val purple = listOf(Color(0xFF2B1F6B), Color(0xFF17123F))
    val blue = listOf(Color(0xFF0F2A5A), Color(0xFF0A1A3A))
    val orange = listOf(Color(0xFF3A1F0F), Color(0xFF241209))
    val gold = listOf(Color(0xFF3A2E0A), Color(0xFF241C06))
    val rose = listOf(Color(0xFF3B1024), Color(0xFF250915))
    val teal = listOf(Color(0xFF0B3A3A), Color(0xFF062626))
    val green = listOf(Color(0xFF103A1E), Color(0xFF0A2413))

    val savingsAccent = Color(0xFF10B981)
    val purpleAccent = Color(0xFF8B7CFF)
    val blueAccent = Color(0xFF3B82F6)
    val orangeAccent = Color(0xFFF97316)
    val goldAccent = Color(0xFFF5C542)
    val roseAccent = Color(0xFFF43F5E)
    val tealAccent = Color(0xFF14B8A6)
    val greenAccent = Color(0xFF22C55E)

    /** Card network → tint + accent (mirrors the web card art without using brand logos). */
    fun forNetwork(network: String?): Pair<List<Color>, Color> = when (network?.uppercase()) {
        "AMEX" -> blue to blueAccent
        "MASTERCARD" -> orange to orangeAccent
        "VISA" -> gold to goldAccent
        "RUPAY" -> purple to purpleAccent
        else -> purple to purpleAccent
    }
}

/**
 * A card with a two-stop gradient, a soft glowing wave along the bottom and a large faded icon on
 * the right — the visual language of the web app's account cards, in Compose.
 */
@Composable
fun FancyCard(
    tint: List<Color>,
    accent: Color,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(tint))
    ) {
        Canvas(Modifier.matchParentSize()) {
            val w = size.width
            val h = size.height
            val wave = Path().apply {
                moveTo(0f, h * 0.78f)
                cubicTo(w * 0.25f, h * 0.55f, w * 0.45f, h * 1.05f, w * 0.7f, h * 0.8f)
                cubicTo(w * 0.85f, h * 0.65f, w * 0.95f, h * 0.7f, w, h * 0.6f)
            }
            drawPath(wave, accent.copy(alpha = 0.35f), style = Stroke(width = 3.dp.toPx()))
            drawPath(wave, accent.copy(alpha = 0.10f), style = Stroke(width = 14.dp.toPx()))
            drawCircle(accent.copy(alpha = 0.10f), radius = w * 0.28f, center = Offset(w * 0.88f, h * 0.3f))
        }
        Icon(
            icon, contentDescription = null, tint = accent,
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 14.dp).size(56.dp).alpha(0.35f),
        )
        Box(Modifier.padding(16.dp)) { content() }
    }
}

/** Small rounded label used for account / kind badges on the cards. */
@Composable
fun TintBadge(text: String, accent: Color) {
    Surface(color = accent.copy(alpha = 0.18f), shape = RoundedCornerShape(999.dp)) {
        Text(text, color = accent, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
    }
}

/** A stat tile with the gradient treatment. */
@Composable
fun FancyStat(label: String, value: String, tint: List<Color>, accent: Color, icon: ImageVector, modifier: Modifier = Modifier) {
    FancyCard(tint, accent, icon, modifier) {
        Column {
            Text(label, fontSize = 12.sp, color = Color.White.copy(alpha = 0.75f))
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}
