package com.jarvis.sync.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.finance.BriefCell
import com.jarvis.sync.finance.EventKind
import com.jarvis.sync.finance.Forecast
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.NextAction
import com.jarvis.sync.finance.Statement
import com.jarvis.sync.finance.dayHeading
import com.jarvis.sync.finance.dayMonth
import com.jarvis.sync.finance.daysTo
import com.jarvis.sync.finance.lakh
import com.jarvis.sync.finance.monthLong
import com.jarvis.sync.finance.monthShortName
import com.jarvis.sync.finance.relativeDays
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.ui.theme.Ink
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToInt

/** Where Home's cards lead. */
class HomeNav(
    val settings: () -> Unit,
    val alerts: () -> Unit,
    val statement: (Long) -> Unit,
    val review: () -> Unit,
    val category: (String) -> Unit,
    val inbox: () -> Unit,
    val wealth: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: AppViewModel, session: SessionEntity, failedSms: Int, nav: HomeNav) {
    val m by vm.model.collectAsState()
    LaunchedEffect(Unit) { vm.refreshDashboard() }
    var allActions by remember { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = { vm.refreshDashboard() }, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val model = m
            val actions = model?.actions(failedSms).orEmpty()
            HomeHeader(vm, session, model, actions.size, nav)
            if (model == null) {
                Box(Modifier.fillMaxWidth().height(240.dp), Alignment.Center) {
                    if (vm.refreshing) CircularProgressIndicator(color = Ink.accentLift)
                    else Text("Pull down to load your money.", color = Ink.dim, fontSize = 14.sp)
                }
                return@Column
            }
            NetWorthHero(model)
            TakeCard(model)
            if (actions.isNotEmpty()) DoThisNext(actions, vm, nav) { allActions = true }
            MonthSpendCard(model, nav)
            NextDays(model, vm, nav)
            CardStatements(model, nav)
            Spacer(Modifier.height(96.dp)) // clear of the + button
        }
    }

    if (allActions) {
        val model = m
        JSheet(onDismiss = { allActions = false }) {
            Text("Do this next", fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
            model?.actions(failedSms).orEmpty().forEach { a ->
                ActionCard(a, Modifier.fillMaxWidth(), vm, nav, background = Ink.raised) { allActions = false }
            }
        }
    }
}

@Composable
private fun HomeHeader(vm: AppViewModel, session: SessionEntity, m: MoneyModel?, attention: Int, nav: HomeNav) {
    val hour = LocalTime.now().hour
    val greeting = when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }
    val sub = buildList {
        add(dayHeading(java.time.LocalDate.now()))
        when {
            vm.offline -> add("offline · last sync")
            vm.refreshing && m == null -> add("loading…")
            else -> {
                m?.forecast?.events?.firstOrNull { it.kind == EventKind.INCOME && daysTo(it.on) <= 3 }
                    ?.let { add("salary expected " + relativeDays(it.on)) }
                if (attention > 0) add("$attention need" + (if (attention == 1) "s" else "") + " attention")
            }
        }
    }.joinToString(" · ")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(greeting, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, color = Ink.text)
            Text(sub, fontSize = 12.sp, color = Ink.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconSquare(Icons.Filled.Notifications, "Alerts", badge = vm.unreadAlerts > 0, onClick = nav.alerts)
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(99.dp)).background(Ink.accentWell).clickable(onClick = nav.settings)
                .semantics { contentDescription = "Settings" },
            contentAlignment = Alignment.Center,
        ) {
            Text(session.username.take(1).uppercase(), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft)
        }
    }
}

@Composable
private fun NetWorthHero(m: MoneyModel) {
    Hero(Modifier.fillMaxWidth()) {
        SectionLabel("Net worth")
        Money(lakh(m.netWorth), size = 38, weight = FontWeight.ExtraBold)
        SplitBar(listOf(m.cash to Ink.accentLift, m.invested to Ink.in_, m.owed to Ink.out))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Legend(Ink.accentLift, "Cash " + lakh(m.cash))
            if (m.invested > 0) Legend(Ink.in_, "Invested " + lakh(m.invested))
            if (m.owed > 0) Legend(Ink.out, "Owed " + lakh(m.owed))
        }
        Hairline()
        val f = m.forecast
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Next 30 days", Modifier.weight(1f))
            Text(
                "low " + lakh(f.minBalance) + " · " + if (f.healthy) "above reserve" else "below reserve",
                fontSize = 12.sp, color = if (f.healthy) Ink.in_ else Ink.out,
            )
        }
        RunwayChart(f)
        val marks = remember(f) {
            val big = f.events.filter { (it.kind == EventKind.CARD || it.kind == EventKind.INCOME || abs(it.amount) >= f.startBalance * 0.05) && it.amount != 0.0 }
                .map { it.on }.distinct().filter { it != f.today }
            (listOf(f.today) + big.take(2) + f.projectedOn).distinct()
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            marks.forEachIndexed { i, d -> Text(if (i == 0) "Today" else dayMonth(d), fontSize = 11.sp, color = Ink.dim) }
        }
    }
}

/**
 * The balance over the next thirty days as steps: up when salary lands, down on each bill, with
 * the reserve as a dashed line underneath. Drawn, not charted — it has one job.
 */
@Composable
private fun RunwayChart(f: Forecast) {
    val desc = "Balance starts at ${lakh(f.startBalance)}, lowest ${lakh(f.minBalance)} on ${dayMonth(f.minOn)}, ends at ${lakh(f.projected)}"
    Canvas(Modifier.fillMaxWidth().height(96.dp).semantics { contentDescription = desc }) {
        val w = size.width
        val h = size.height
        val values = f.events.map { it.balanceAfter } + f.reserve
        val lo = values.minOrNull() ?: 0.0
        val hi = values.maxOrNull() ?: 1.0
        val span = (hi - lo).takeIf { it > 1 } ?: 1.0
        fun y(v: Double) = (8f + (h - 16f) * (1 - ((v - lo) / span).toFloat()))
        fun x(d: java.time.LocalDate) = (ChronoUnit.DAYS.between(f.today, d).toFloat() / 30f * w).coerceIn(0f, w)

        val line = Path()
        var cy = y(f.startBalance)
        line.moveTo(0f, cy)
        for (e in f.events.drop(1)) {
            val ex = x(e.on)
            line.lineTo(ex, cy)
            cy = y(e.balanceAfter)
            line.lineTo(ex, cy)
        }
        line.lineTo(w, cy)
        val fill = Path().apply { addPath(line); lineTo(w, h); lineTo(0f, h); close() }
        drawPath(fill, Ink.accent.copy(alpha = 0.25f))
        drawPath(line, Ink.accentLift, style = Stroke(2.dp.toPx()))
        drawLine(
            Ink.out, Offset(0f, y(f.reserve)), Offset(w, y(f.reserve)), 1.2.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())),
        )
        for (e in f.events) {
            val marked = e.kind == EventKind.INCOME || e.kind == EventKind.CARD || (e.amount < 0 && abs(e.amount) >= f.startBalance * 0.05)
            if (!marked) continue
            drawCircle(if (e.amount > 0) Ink.in_ else Ink.out, 4.dp.toPx(), Offset(x(e.on), y(e.balanceAfter)))
        }
    }
}

@Composable
private fun TakeCard(m: MoneyModel) {
    val score = m.x.score
    Card(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (score != null) {
                val c = scoreColour(score.rating)
                ScoreRing(score.score, c)
                Column(Modifier.weight(1f)) {
                    Text(score.rating.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.1.sp, color = c)
                    Text(score.headline, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp, color = Ink.text)
                }
            } else {
                Column(Modifier.weight(1f)) {
                    Text("SAFE TO SPEND", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.1.sp, color = Ink.in_)
                    Text(
                        rupees(m.forecast.safeToSpend) + " until month end, after the bills and a " + lakh(m.reserve) + " reserve.",
                        fontSize = 13.sp, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp, color = Ink.text,
                    )
                }
            }
        }
    }
}

internal fun scoreColour(rating: String?): Color = when (rating?.lowercase()) {
    "excellent", "good" -> Ink.in_
    "fair" -> Ink.warn
    null -> Ink.accentLift
    else -> Ink.out
}

@Composable
private fun DoThisNext(actions: List<NextAction>, vm: AppViewModel, nav: HomeNav, onAll: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        SectionLabel("Do this next", Modifier.weight(1f))
        Text(
            "All ${actions.size}", fontSize = 12.sp, color = Ink.accentSoft, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onAll).padding(horizontal = 6.dp, vertical = 4.dp),
        )
    }
    val state = rememberLazyListState()
    val current by remember { derivedStateOf { state.firstVisibleItemIndex + if (state.firstVisibleItemScrollOffset > 120) 1 else 0 } }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        LazyRow(
            state = state,
            flingBehavior = rememberSnapFlingBehavior(state),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(actions) { a -> ActionCard(a, Modifier.width(250.dp), vm, nav) }
        }
        Dots(actions.size, current.coerceAtMost(actions.size - 1))
    }
}

@Composable
private fun ActionCard(
    a: NextAction,
    modifier: Modifier,
    vm: AppViewModel,
    nav: HomeNav,
    background: Color = Ink.surface,
    after: () -> Unit = {},
) {
    val tone = toneColour(a.tone)
    val go: () -> Unit = {
        after()
        when (val t = a.target) {
            is NextAction.Target.Statement -> nav.statement(t.accountId)
            is NextAction.Target.Category -> nav.category(t.category)
            NextAction.Target.Review -> nav.review()
            NextAction.Target.Inbox -> nav.inbox()
            NextAction.Target.Wealth -> nav.wealth()
            is NextAction.Target.Reminder -> vm.markPaid(t.reminderId, t.on.toString(), t.amount)
        }
    }
    Card(modifier, background = background, padding = PaddingValues(14.dp), gap = 8.dp, onClick = go) {
        Pill(a.chip, tone)
        if (a.amount != null) Money(rupees(a.amount), size = 20, weight = FontWeight.ExtraBold)
        else if (a.headline != null) Text(a.headline, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink.text, maxLines = 1)
        Text(a.detail, fontSize = 12.sp, color = Ink.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (a.button != null) JButton(a.button, Modifier.fillMaxWidth(), height = 40.dp, fontSize = 13, onClick = go)
    }
}

internal fun toneColour(t: BriefCell.Tone): Color = when (t) {
    BriefCell.Tone.IN -> Ink.in_
    BriefCell.Tone.OUT -> Ink.out
    BriefCell.Tone.WARN -> Ink.warn
    BriefCell.Tone.PLAIN -> Ink.muted
}

@Composable
private fun MonthSpendCard(m: MoneyModel, nav: HomeNav) {
    Card(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel(monthLong(m.thisMonth).substringBefore(" ") + " spend", Modifier.weight(1f))
            if (m.lastMonthToDate > 0) {
                val change = ((m.monthToDate - m.lastMonthToDate) / m.lastMonthToDate * 100).roundToInt()
                Text(
                    (if (change <= 0) "▼ " else "▲ ") + abs(change) + "% vs " + monthShortName(m.thisMonth.minusMonths(1)),
                    fontSize = 12.sp, color = if (change <= 0) Ink.in_ else Ink.out,
                )
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Money(rupees(m.monthSpend), size = 26, weight = FontWeight.ExtraBold)
            Text("· today " + rupees(m.spentToday), fontSize = 12.sp, color = Ink.muted, modifier = Modifier.padding(bottom = 4.dp))
        }
        val top = m.byCategory.take(4)
        val biggest = top.maxOfOrNull { it.second }?.coerceAtLeast(1.0) ?: 1.0
        val budgets = m.budgets.associateBy { it.category }
        top.forEach { (cat, total) ->
            val over = budgets[cat]?.over == true
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).clickable { nav.category(cat) }) {
                Row {
                    Text(cat, fontSize = 13.sp, color = Ink.text, modifier = Modifier.weight(1f), maxLines = 1)
                    if (over) Text(" · over  ", fontSize = 13.sp, color = Ink.warn)
                    Money(rupees(total), size = 13, weight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(5.dp))
                Bar((total / biggest).toFloat(), if (over) Ink.warn else Ink.accentLift)
            }
        }
    }
}

@Composable
private fun NextDays(m: MoneyModel, vm: AppViewModel, nav: HomeNav) {
    val events = m.forecast.within(14)
    val (paid, total) = m.paidThisMonth
    if (events.isEmpty() && total == 0) return
    Card(Modifier.fillMaxWidth(), padding = PaddingValues(0.dp), gap = 0.dp) {
        Row(Modifier.padding(start = 15.dp, end = 15.dp, top = 14.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Next 14 days", Modifier.weight(1f))
            val out = events.filter { it.amount < 0 }.sumOf { -it.amount }
            if (out > 0) Text("−" + lakh(out) + " out", fontSize = 12.sp, color = Ink.muted)
        }
        events.forEach { e ->
            Hairline()
            val colour = when {
                e.kind == EventKind.INCOME -> Ink.in_
                e.kind == EventKind.CARD && daysTo(e.on) <= 5 -> Ink.out
                else -> Ink.text
            }
            Row(
                Modifier.fillMaxWidth()
                    .then(if (e.statementAccountId != null) Modifier.clickable { nav.statement(e.statementAccountId) } else Modifier)
                    .padding(horizontal = 15.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(e.on.dayOfMonth.toString(), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = colour)
                    Text(
                        monthShortName(java.time.YearMonth.from(e.on)).uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold,
                        color = if (colour == Ink.text) Ink.muted else colour,
                    )
                }
                Text(e.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                when {
                    e.unknown -> Text("amount not set", fontSize = 12.sp, color = Ink.dim)
                    e.amount > 0 -> Money("+" + rupees(e.amount), size = 14, color = Ink.in_, weight = FontWeight.ExtraBold)
                    else -> Money(rupees(-e.amount), size = 14, weight = FontWeight.ExtraBold)
                }
                if (e.reminderId != null) {
                    Text(
                        "Paid", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp))
                            .clickable { vm.markPaid(e.reminderId, e.on.toString(), if (e.unknown) null else -e.amount) }
                            .padding(horizontal = 6.dp, vertical = 6.dp),
                    )
                }
            }
        }
        if (total > 0) {
            Hairline()
            val month = monthLong(m.thisMonth).substringBefore(" ")
            Text(
                if (paid == total) "✓ All $total $month items paid" else "$paid of $total $month items paid",
                fontSize = 12.sp, color = if (paid == total) Ink.dim else Ink.muted,
                modifier = Modifier.padding(horizontal = 15.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun CardStatements(m: MoneyModel, nav: HomeNav) {
    if (m.statements.isEmpty()) return
    SectionLabel("Card statements")
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        items(m.statements, key = { it.summary.accountId }) { s -> StatementTile(s) { nav.statement(s.summary.accountId) } }
    }
}

@Composable
private fun StatementTile(s: Statement, onClick: () -> Unit) {
    val due = s.dueOn
    val soon = due != null && s.summary.billDue > 0 && daysTo(due) <= 5
    val edge = if (soon) Ink.warn else networkColour(s.summary.network)
    Row(
        Modifier.width(220.dp).height(IntrinsicSizeHeight).clip(RoundedCornerShape(16.dp)).background(Ink.surface).clickable(onClick = onClick),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(edge))
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(s.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Money(if (s.summary.billDue > 0) rupees(s.summary.billDue) else "Nothing due", size = 20, weight = FontWeight.ExtraBold)
            val line = buildList {
                if (due != null && s.summary.billDue > 0) add("due " + dayMonth(due))
                if (soon) s.summary.utilisationPct?.let { add("$it% used") }
                else if (s.summary.unbilled > 0) add(rupees(s.summary.unbilled) + " unbilled")
            }.joinToString(" · ")
            Text(line.ifEmpty { "no bill open" }, fontSize = 12.sp, color = if (soon) Ink.out else Ink.muted, maxLines = 1)
        }
    }
}

private val IntrinsicSizeHeight = 110.dp

internal fun networkColour(network: String?): Color = when (network?.uppercase()) {
    "AMEX" -> Ink.alt
    "VISA" -> Ink.warn
    "MASTERCARD" -> Color(0xFFF97316)
    else -> Ink.accentLift
}
