package com.jarvis.sync.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.ui.theme.Ink
import com.jarvis.sync.ui.theme.MoneyStyle

/*
 * The app's shared surfaces. What used to live here were gradient cards with a glowing wave and a
 * big faded icon behind every figure; six of them on the dashboard meant six competing colours and
 * the numbers came last. These are flat, hairlined and quiet, so the type carries the hierarchy.
 */

/** A card: the one raised surface in the app. Nothing here is tinted by what it contains. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(15.dp),
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Ink.surface)
            .border(1.dp, Ink.hairline, RoundedCornerShape(16.dp))
            .padding(padding),
    ) { content() }
}

/**
 * Rows that belong together, hairline-separated inside one rounded surface — an upcoming bill
 * list, a group of settings. The gaps are the hairline showing through, so there is one border to
 * get right rather than one per row.
 */
@Composable
fun PanelGroup(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Ink.hairline)
            .border(1.dp, Ink.hairline, RoundedCornerShape(16.dp)),
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) { content() }
}

/** One row inside a [PanelGroup]. */
@Composable
fun PanelRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .fillMaxWidth()
            .background(Ink.surface)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 15.dp, vertical = 14.dp),
    ) { content() }
}

/**
 * The small capitals above a section. Set apart from what follows on every axis that matters —
 * size, weight, tracking, colour — because a bold sentence-case line reads as another row.
 */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.09.sp * 11,
            color = Ink.dim,
            modifier = Modifier.weight(1f),
        )
        trailing?.invoke()
    }
}

/** A band across a list, for a section header inside a scrolling ledger. */
@Composable
fun SectionBand(text: String, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    Row(
        modifier
            .fillMaxWidth()
            .background(Ink.band)
            .padding(horizontal = 20.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text.uppercase(),
            fontSize = 10.5.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.1.sp * 10.5f,
            color = Ink.dim,
            modifier = Modifier.weight(1f),
        )
        trailing?.invoke()
    }
}

/** An amount. Every figure in the app goes through here so they all sit the same. */
@Composable
fun Money(
    text: String,
    size: Int = 15,
    color: Color = Ink.text,
    weight: FontWeight = FontWeight.Bold,
    modifier: Modifier = Modifier,
) {
    Text(text, modifier, style = MoneyStyle.copy(fontSize = size.sp, color = color, fontWeight = weight))
}

/** A label over a figure: what the old FancyStat was, without the gradient and the giant glyph. */
@Composable
fun StatTile(
    label: String,
    value: String,
    icon: ImageVector? = null,
    accent: Color = Ink.text,
    modifier: Modifier = Modifier,
) {
    Panel(modifier, PaddingValues(horizontal = 15.dp, vertical = 14.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                if (icon != null) Icon(icon, null, Modifier.size(14.dp), tint = accent)
                Text(label, fontSize = 12.sp, color = Ink.muted)
            }
            Money(value, size = 19)
        }
    }
}

/** A proportional bar: category spend, a budget against its limit, a card against its limit. */
@Composable
fun Meter(
    fraction: Float,
    modifier: Modifier = Modifier,
    color: Color = Ink.out,
    height: Int = 3,
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(Ink.track),
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(height.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(color),
        )
    }
}

/** The square well behind a row's initial or icon. */
@Composable
fun Well(modifier: Modifier = Modifier, size: Int = 36, tint: Color = Ink.well, content: @Composable () -> Unit) {
    Box(
        modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size / 3.2f).dp))
            .background(tint),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** A date stamp down the left of a ledger row: the day large, the month small under it. */
@Composable
fun DayStamp(day: String, month: String, modifier: Modifier = Modifier) {
    Column(modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Money(day, size = 15, weight = FontWeight.ExtraBold)
        Spacer(Modifier.height(1.dp))
        Text(
            month.uppercase(),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.06.sp * 9,
            color = Ink.dim,
        )
    }
}

/** A filter chip. Selected is a solid violet; the rest are outlines. */
@Composable
fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) Ink.accentLift else Color.Transparent)
            .then(if (selected) Modifier else Modifier.border(1.dp, Ink.hairlineStrong, RoundedCornerShape(999.dp)))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(
            text,
            fontSize = 12.5.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = if (selected) Ink.ground else Ink.muted,
        )
    }
}

/** A quiet tag on a row — a category, an account. */
@Composable
fun Tag(text: String, modifier: Modifier = Modifier, color: Color = Ink.muted) {
    Box(
        modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Ink.well)
            .padding(horizontal = 7.dp, vertical = 2.dp),
    ) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = color)
    }
}

/** A full-width hairline, optionally inset past a row's leading element. */
@Composable
fun Rule(startInset: Int = 0) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = startInset.dp)
            .height(1.dp)
            .background(Ink.hairline),
    )
}
