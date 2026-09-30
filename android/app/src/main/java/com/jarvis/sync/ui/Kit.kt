package com.jarvis.sync.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.ui.theme.Ink

/*
 * The pieces the 1.2.0 screens are built from, drawn to the design canvas's phone boards: one
 * dark ground, hairlined cards, violet for the app and its actions, green for money in, rose for
 * money out, amber for something to look at.
 */

/** A card on the ground: 16dp corners, one hairline. */
@Composable
fun Card(
    modifier: Modifier = Modifier,
    border: Color = Ink.hairline,
    background: Color = Ink.surface,
    radius: Dp = 16.dp,
    padding: PaddingValues = PaddingValues(15.dp),
    gap: Dp = 10.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(radius))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(radius))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content,
    )
}

/** The one tinted panel on a screen: net worth on Home, the brief on Ask. */
@Composable
fun Hero(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Card(modifier, Ink.hairlineStrong, Ink.hero, 22.dp, PaddingValues(18.dp), 12.dp, content = content)

/** A small coloured label on a tint of itself: "In 5 days", "off pace", "2". */
@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier, size: Int = 11) {
    Text(
        text,
        modifier
            .clip(RoundedCornerShape(99.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 9.dp, vertical = 3.dp),
        fontSize = size.sp,
        fontWeight = FontWeight.ExtraBold,
        color = color,
        maxLines = 1,
    )
}

/** A question or suggestion to tap: violet outline, violet text. */
@Composable
fun AskChip(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Text(
        text,
        modifier
            .clip(RoundedCornerShape(99.dp))
            .border(1.dp, Ink.accent.copy(alpha = 0.4f), RoundedCornerShape(99.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = if (enabled) Ink.accentSoft else Ink.dim,
        maxLines = 1,
    )
}

enum class ButtonStyle { PRIMARY, SOFT, OUTLINE, DANGER }

/** Every button in the app: 44dp or taller, one of four looks. */
@Composable
fun JButton(
    text: String,
    modifier: Modifier = Modifier,
    style: ButtonStyle = ButtonStyle.PRIMARY,
    height: Dp = 46.dp,
    enabled: Boolean = true,
    busy: Boolean = false,
    fontSize: Int = 14,
    onClick: () -> Unit,
) {
    val (bg, fg, border) = when (style) {
        ButtonStyle.PRIMARY -> Triple(if (enabled) Ink.accent else Ink.well, if (enabled) Color.White else Ink.dim, null)
        ButtonStyle.SOFT -> Triple(Ink.accentWell, Ink.accentSoft, null)
        ButtonStyle.OUTLINE -> Triple(Color.Transparent, Ink.text, Ink.hairlineStrong)
        ButtonStyle.DANGER -> Triple(Color.Transparent, Ink.out, Ink.out.copy(alpha = 0.35f))
    }
    Box(
        modifier
            .height(height)
            .clip(RoundedCornerShape(13.dp))
            .background(bg)
            .then(if (border != null) Modifier.border(1.dp, border, RoundedCornerShape(13.dp)) else Modifier)
            .clickable(enabled = enabled && !busy, role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = fg)
        } else {
            Text(text, fontSize = fontSize.sp, fontWeight = FontWeight.ExtraBold, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A square icon button in a header, with an optional unread dot. */
@Composable
fun IconSquare(icon: ImageVector, label: String, badge: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Ink.surface)
            .border(1.dp, Ink.hairlineStrong, RoundedCornerShape(12.dp))
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, label, tint = Ink.text, modifier = Modifier.size(19.dp))
        if (badge) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 11.dp).size(7.dp)
                    .clip(RoundedCornerShape(99.dp)).background(Ink.out),
            )
        }
    }
}

/** A row's avatar: initials in a rounded square. */
@Composable
fun Avatar(text: String, fg: Color = Ink.accentSoft, bg: Color = Ink.accentWell, size: Dp = 34.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = fg, maxLines = 1)
    }
}

/** Parts of a whole side by side, 2dp apart: cash / invested / owed, a portfolio's mix. */
@Composable
fun SplitBar(parts: List<Pair<Double, Color>>, modifier: Modifier = Modifier, height: Dp = 8.dp) {
    val shown = parts.filter { it.first > 0 }
    if (shown.isEmpty()) return
    Row(
        modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(99.dp)),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        shown.forEach { (v, c) -> Box(Modifier.weight(v.toFloat()).fillMaxHeight().background(c)) }
    }
}

/** A bar on a track, filled to a fraction. */
@Composable
fun Bar(fraction: Float, color: Color, modifier: Modifier = Modifier, height: Dp = 4.dp, track: Color = Ink.track) {
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(99.dp)).background(track)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(height).clip(RoundedCornerShape(99.dp)).background(color))
    }
}

/** The finance score as a ring, the number inside it. */
@Composable
fun ScoreRing(score: Int, color: Color, size: Dp = 52.dp) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = 5.dp.toPx()
            val inset = stroke / 2
            val arc = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(Ink.track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            drawArc(color, -90f, 360f * score.coerceIn(0, 100) / 100f, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Text(score.toString(), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Ink.text)
    }
}

/** Where a row of swipeable cards is: a long dash for the one in view. */
@Composable
fun Dots(count: Int, selected: Int) {
    if (count < 2) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)) {
        repeat(count) { i ->
            Box(
                Modifier.width(if (i == selected) 16.dp else 4.dp).height(4.dp)
                    .clip(RoundedCornerShape(99.dp)).background(if (i == selected) Ink.accentLift else Ink.faint),
            )
        }
    }
}

/** A segmented control: one choice of a few, the chosen one on a violet well. */
@Composable
fun Segmented(options: List<String>, selected: Int, modifier: Modifier = Modifier, background: Color = Ink.surface, onSelect: (Int) -> Unit) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(background).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEachIndexed { i, o ->
            val on = i == selected
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                    .background(if (on) Ink.accentWell else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(i) }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    o, fontSize = 13.sp, maxLines = 1,
                    fontWeight = if (on) FontWeight.ExtraBold else FontWeight.Bold,
                    color = if (on) Ink.accentSoft else Ink.muted,
                )
            }
        }
    }
}

/** A sheet from the bottom, the way the canvas draws Review, Statement and Add. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = Ink.surface,
        contentColor = Ink.text,
        scrimColor = Color.Black.copy(alpha = 0.55f),
        shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
        dragHandle = {
            Box(Modifier.padding(top = 10.dp, bottom = 6.dp).width(40.dp).height(4.dp).clip(RoundedCornerShape(99.dp)).background(Ink.faint))
        },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/** Label and figure stacked, for the three-up grids (Out / In / Payments, Billed / Paid / Due). */
@Composable
fun RowScope.GridCell(
    label: String,
    value: String,
    sub: String?,
    subColor: Color = Ink.dim,
    highlight: Boolean = false,
    divider: Boolean = true,
) {
    Column(
        Modifier.weight(1f).background(if (highlight) Ink.accentWell else Color.Transparent).padding(11.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp, color = if (highlight) Ink.accentSoft else Ink.muted, maxLines = 1)
        Money(value, size = 15, weight = FontWeight.ExtraBold, color = if (highlight) Ink.accentSoft else Ink.text)
        if (sub != null) Text(sub, fontSize = 10.5.sp, color = subColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (divider) Box(Modifier.width(1.dp).fillMaxHeight().background(Ink.hairline))
}

/** A thin rule inside a card, full width. */
@Composable
fun Hairline(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth().height(1.dp).background(Ink.hairline))

/** Empty state or a short note, centred and quiet. */
@Composable
fun Quiet(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.fillMaxWidth().padding(vertical = 14.dp), fontSize = 13.sp, color = Ink.dim)
}

/** A bordered space for a figure's label beside it: "● Cash ₹11.7L". */
@Composable
fun Legend(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(RoundedCornerShape(99.dp)).background(color))
        Spacer(Modifier.width(5.dp))
        Text(text, fontSize = 12.sp, color = Ink.muted, maxLines = 1)
    }
}

/** A thin outline, for rows inside a sheet. */
val HairlineBorder = BorderStroke(1.dp, Ink.hairline)
