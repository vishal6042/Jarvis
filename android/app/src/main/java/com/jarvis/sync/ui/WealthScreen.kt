package com.jarvis.sync.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.LoanDto
import com.jarvis.sync.finance.GoalRead
import com.jarvis.sync.finance.GoalState
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.fundedPlan
import com.jarvis.sync.finance.holdingGroups
import com.jarvis.sync.finance.inWords
import com.jarvis.sync.finance.lakh
import com.jarvis.sync.finance.loanLabel
import com.jarvis.sync.finance.loanSchedule
import com.jarvis.sync.finance.mixTake
import com.jarvis.sync.finance.monthShortName
import com.jarvis.sync.finance.monthYear
import com.jarvis.sync.finance.monthlyIn
import com.jarvis.sync.finance.payoutLadder
import com.jarvis.sync.finance.repaidShare
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.ui.theme.Ink
import java.time.LocalDate
import java.util.Locale
import kotlin.math.roundToInt

/** Colours for the mix, biggest holding first. */
private val MIX = listOf(Ink.accent, Ink.accentLift, Ink.in_, Ink.alt, Ink.warn, Color(0xFFF97316), Ink.accentSoft, Ink.faint)

@Composable
fun WealthScreen(vm: AppViewModel) {
    val m by vm.model.collectAsState()
    var tab by remember { mutableIntStateOf(0) }
    val model = m
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 14.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column {
            Text("Wealth", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            if (model != null) {
                Text(
                    listOfNotNull(
                        lakh(model.invested) + " invested",
                        model.x.goals.size.takeIf { it > 0 }?.let { "$it goal" + if (it == 1) "" else "s" },
                        model.owed.takeIf { it > 0 }?.let { lakh(it) + " owed" },
                    ).joinToString(" · "),
                    fontSize = 12.sp, color = Ink.muted,
                )
            }
        }
        if (model == null) {
            Quiet("Nothing cached yet. Open Home and pull down to load.")
            return@Column
        }
        Segmented(listOf("All", "Investments", "Goals", "Loan"), tab) { tab = it }
        if (tab == 0 || tab == 1) {
            mixTake(model.x.holdings)?.let { (head, tail) -> TakeLine(head, tail) }
            Investments(model)
            FreesUp(model)
        }
        if (tab == 0 || tab == 2) Goals(vm, model)
        if (tab == 0 || tab == 3) {
            if (model.x.loans.isEmpty() && tab == 3) Quiet("No loans. Nothing owed.")
            model.x.loans.filter { it.outstanding > 0 }.forEach { LoanCard(it) }
        }
    }
}

@Composable
private fun TakeLine(head: String, tail: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(Brush.horizontalGradient(listOf(Ink.accentWell, Ink.surface)))
            .border(1.dp, Ink.hairline, RoundedCornerShape(16.dp)).padding(13.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Filled.AutoAwesome, null, tint = Ink.accentSoft, modifier = Modifier.size(16.dp))
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(head) }
                withStyle(SpanStyle(color = Ink.muted)) { append(tail) }
            },
            fontSize = 13.sp, lineHeight = 18.sp,
        )
    }
}

@Composable
private fun Investments(m: MoneyModel) {
    val holdings = m.x.holdings
    if (holdings.isEmpty()) return
    val current = holdings.sumOf { it.current }
    val principal = holdings.sumOf { it.principal }
    val gain = current - principal
    val groups = holdingGroups(holdings)
    Card(Modifier.fillMaxWidth(), gap = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Investments", Modifier.weight(1f))
            val monthly = monthlyIn(holdings)
            if (monthly > 0) Text(rupees(monthly) + " a month in", fontSize = 12.sp, color = Ink.muted)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Money(lakh(current), size = 28, weight = FontWeight.ExtraBold)
            if (principal > 0) {
                Text(
                    (if (gain >= 0) "▲ " else "▼ ") + lakh(kotlin.math.abs(gain)) + " · " + (gain / principal * 100).roundToInt() + "%",
                    fontSize = 13.sp, color = if (gain >= 0) Ink.in_ else Ink.out, modifier = Modifier.padding(bottom = 4.dp),
                )
            }
        }
        val weighted = holdings.filter { (it.rate ?: 0.0) > 0 }.let { rs ->
            val v = rs.sumOf { it.current }
            if (v > 0) rs.sumOf { (it.rate ?: 0.0) * it.current } / v else null
        }
        Text(
            listOfNotNull(weighted?.let { String.format(Locale.US, "%.1f%% a year", it) + " (by their stated rates)" }, rupees(principal) + " put in").joinToString(" · "),
            fontSize = 12.sp, color = Ink.muted,
        )
        SplitBar(groups.mapIndexed { i, g -> g.value to MIX[i % MIX.size] })
        Column {
            groups.forEachIndexed { i, g ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(RoundedCornerShape(3.dp)).background(MIX[i % MIX.size]))
                    Text(
                        buildAnnotatedString {
                            append(g.label + if (g.count > 1) " ×${g.count}" else "")
                            val rates = g.rates
                            if (rates.isNotEmpty()) withStyle(SpanStyle(color = Ink.dim)) {
                                val lo = rates.min(); val hi = rates.max()
                                append(" · " + if (lo == hi) fmtRate(lo) else fmtRate(lo).removeSuffix("%") + "–" + fmtRate(hi))
                            }
                        },
                        fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Money(lakh(g.value), size = 13, weight = FontWeight.ExtraBold)
                }
                if (i < groups.lastIndex) Hairline()
            }
        }
    }
}

private fun fmtRate(r: Double) = String.format(Locale.US, if (r % 1.0 == 0.0) "%.0f%%" else "%.1f%%", r)

@Composable
private fun FreesUp(m: MoneyModel) {
    val ladder = payoutLadder(m.payouts).take(4)
    if (ladder.isEmpty()) return
    val biggest = ladder.maxOf { it.amount }.coerceAtLeast(1.0)
    Card(Modifier.fillMaxWidth()) {
        SectionLabel("When money frees up")
        ladder.forEachIndexed { i, p ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(monthShortName(p.month) + " " + p.month.year, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.width(66.dp))
                Box(Modifier.weight(1f)) { Bar((p.amount / biggest).toFloat(), MIX[(i + 2) % MIX.size], height = 8.dp) }
                Money(lakh(p.amount) + if (p.estimated) "*" else "", size = 13, weight = FontWeight.ExtraBold, modifier = Modifier.width(70.dp))
            }
        }
        val kinds = m.payouts.groupBy { it.inv.kind }.map { (k, v) -> com.jarvis.sync.finance.kindLabel(k, v.size > 1).let { if (v.size > 1) "${v.size} $it" else it } }
        Text(
            kinds.joinToString(" · ") + (if (ladder.any { it.estimated }) " · * today's value, the payout is not known" else ""),
            fontSize = 11.sp, color = Ink.dim,
        )
    }
}

@Composable
private fun Goals(vm: AppViewModel, m: MoneyModel) {
    if (m.goals.isEmpty()) return
    val (keep, basis) = m.keep
    SectionLabel(if (basis > 0) "Goals · you keep ~" + lakh(keep) + " a month" else "Goals")
    m.goals.filter { it.state != GoalState.REACHED }.forEach { g -> GoalCard(vm, m, g, keep) }
    m.goals.filter { it.state == GoalState.REACHED }.forEach { g ->
        Text("✓ " + g.goal.name + " · " + lakh(g.goal.targetAmount) + " reached", fontSize = 13.sp, color = Ink.in_, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun GoalCard(vm: AppViewModel, m: MoneyModel, g: GoalRead, keep: Double) {
    val off = g.state == GoalState.OFF_PACE
    Card(Modifier.fillMaxWidth(), border = if (off) Ink.out.copy(alpha = 0.33f) else Ink.hairline) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(g.goal.name, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            when (g.state) {
                GoalState.OFF_PACE -> Pill("off pace", Ink.out)
                GoalState.ON_TRACK -> Pill("on track", Ink.in_)
                GoalState.UNDATED -> Pill("no date", Ink.muted)
                GoalState.REACHED -> Pill("reached", Ink.in_)
            }
        }
        val target = g.goal.targetDate?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
        Text(
            listOfNotNull(
                rupees(g.goal.savedAmount) + " of " + lakh(g.goal.targetAmount),
                target?.let { "by " + com.jarvis.sync.finance.dayMonth(it) + " " + it.year },
                when {
                    g.overdue -> "past its date"
                    g.needed != null && g.state == GoalState.ON_TRACK -> inWords(g.needed) + " a month finishes it"
                    g.needed != null -> "needs " + inWords(g.needed) + " a month"
                    g.eta != null -> "at today's pace, " + monthYear(g.eta)
                    else -> null
                },
            ).joinToString(" · "),
            fontSize = 13.sp, color = Ink.muted,
        )
        Bar(g.pct, if (off) Ink.out else Ink.in_, height = 6.dp)
        if (off) {
            val plan = fundedPlan(g, keep, m.payouts)
            if (plan != null) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Ink.accentWell).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("✦ RECOMMENDED PLAN", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.9.sp, color = Ink.accentSoft)
                    Text(
                        buildAnnotatedString {
                            append(monthYear(plan.by) + ": ")
                            if (plan.monthly > 0) {
                                append("set aside ")
                                withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(rupees(plan.monthly) + " a month") }
                                append(" and add ")
                            } else append("add ")
                            append(plan.noun + "' ")
                            withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(lakh(plan.payoutTotal)) }
                            append(" payout.")
                        },
                        fontSize = 13.sp, lineHeight = 19.sp,
                    )
                    Text(
                        listOfNotNull(
                            if (plan.keepsDate) null else "Moves the date to " + monthYear(plan.by),
                            "notes the deposits on the goal",
                            if (plan.monthly > 0) "adds a monthly reminder" else null,
                        ).joinToString(", ").replaceFirstChar { it.uppercase() } + ".",
                        fontSize = 11.sp, color = Ink.muted,
                    )
                    JButton("Use this plan", Modifier.fillMaxWidth(), height = 40.dp, fontSize = 13, busy = vm.planBusy == g.goal.id) { vm.usePlan(g, plan, m) }
                }
            } else if (g.eta != null) {
                Text("At what you keep now it is reached around " + monthYear(g.eta) + ".", fontSize = 12.sp, color = Ink.muted)
            }
        }
    }
}

@Composable
private fun LoanCard(loan: LoanDto) {
    val schedule = remember(loan) { loanSchedule(loan) }
    val clear = schedule.lastOrNull()?.month
    val interestLeft = schedule.sumOf { it.interest }
    Card(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel(loanLabel(loan), Modifier.weight(1f))
            clear?.let { Text("Debt-free " + monthShortName(it) + " " + it.year, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.in_) }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Money(rupees(loan.outstanding), size = 24, weight = FontWeight.ExtraBold)
            Text(
                listOfNotNull(
                    "left",
                    loan.rate?.let { fmtRate(it) },
                    repaidShare(loan)?.let { (it * 100).roundToInt().toString() + "% repaid" },
                ).joinToString(" · "),
                fontSize = 12.sp, color = Ink.muted, modifier = Modifier.padding(bottom = 3.dp),
            )
        }
        if (schedule.isEmpty()) {
            Text("EMI " + rupees(loan.emi) + " · add the outstanding and rate on the web to see the payments left.", fontSize = 12.sp, color = Ink.dim)
            return@Card
        }
        // Each payment left, as a bar: principal in green, the interest part in rose on top. A long
        // loan shows its next twelve and the month it ends.
        val shown = if (schedule.size <= 12) schedule else schedule.take(11) + schedule.last()
        val biggest = shown.maxOf { it.principal + it.interest }.coerceAtLeast(1.0)
        Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            shown.forEachIndexed { i, p ->
                val lastOne = i == shown.lastIndex
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val interestH = (60 * p.interest / biggest).toFloat().coerceAtLeast(if (p.interest > 0) 1f else 0f)
                    if (interestH > 0) Box(Modifier.fillMaxWidth().height(interestH.dp).background(Ink.out))
                    Box(
                        Modifier.fillMaxWidth().height((60 * p.principal / biggest).toFloat().coerceAtLeast(2f).dp)
                            .clip(RoundedCornerShape(4.dp)).background(Ink.in_)
                            .then(if (lastOne) Modifier.border(2.dp, Ink.text, RoundedCornerShape(4.dp)) else Modifier),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth()) {
            shown.forEachIndexed { i, p ->
                Text(
                    monthShortName(p.month), fontSize = 10.sp, textAlign = TextAlign.Center, maxLines = 1,
                    color = if (i == shown.lastIndex) Ink.text else Ink.dim,
                    fontWeight = if (i == shown.lastIndex) FontWeight.ExtraBold else FontWeight.Normal,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Text(
            "${schedule.size} EMI" + (if (schedule.size == 1) "" else "s") + " of " + rupees(loan.emi) + " left. " +
                if (interestLeft > 0) "Only " + rupees(interestLeft) + " of it is interest" +
                    (if (interestLeft < loan.outstanding * 0.05) ", so prepaying saves little." else ".") else "",
            fontSize = 12.sp, color = Ink.muted,
        )
    }
}
