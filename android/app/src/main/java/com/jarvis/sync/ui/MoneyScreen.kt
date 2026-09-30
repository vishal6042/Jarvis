package com.jarvis.sync.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.TransactionDto
import com.jarvis.sync.finance.CATEGORIES
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.Statement
import com.jarvis.sync.finance.day
import com.jarvis.sync.finance.dayHeading
import com.jarvis.sync.finance.dayMonth
import com.jarvis.sync.finance.daysTo
import com.jarvis.sync.finance.earningOf
import com.jarvis.sync.finance.initials
import com.jarvis.sync.finance.isUncategorised
import com.jarvis.sync.finance.lakh
import com.jarvis.sync.finance.median
import com.jarvis.sync.finance.merchantKey
import com.jarvis.sync.finance.merchantLabel
import com.jarvis.sync.finance.monthLong
import com.jarvis.sync.finance.monthShortName
import com.jarvis.sync.finance.pastStatements
import com.jarvis.sync.finance.purchasesBetween
import com.jarvis.sync.finance.realFlow
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.finance.shortAccount
import com.jarvis.sync.finance.spendOf
import com.jarvis.sync.ui.theme.Ink
import java.time.LocalDate
import java.time.YearMonth

private val FILTER_EXAMPLES = listOf("swiggy in august", "refunds this month", "cabs under 2k", "food over ₹500 last week")

@Composable
fun MoneyScreen(vm: AppViewModel, openStatement: (Long) -> Unit, openReview: () -> Unit) {
    val m by vm.model.collectAsState()
    var selected by remember { mutableStateOf<TransactionDto?>(null) }
    val model = m
    if (model == null) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Text("Money", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            Quiet("Nothing cached yet. Open Home and pull down to load.")
        }
        return
    }
    val rows = vm.visibleRows(model)
    val filtered = vm.aiFilter != null || vm.query.isNotBlank() || vm.categoryFilter != null
    val monthRows = model.rowsIn(vm.month)
    val out = monthRows.sumOf { spendOf(it, model.cardIds) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 24.dp)) {
        item {
            MoneyHeader(vm, model, monthRows.size, out)
            Spacer(Modifier.height(12.dp))
            AskBox(vm)
            Spacer(Modifier.height(10.dp))
            FilterChips(vm)
            Spacer(Modifier.height(12.dp))
            if (!filtered) {
                MonthStrip(model, vm.month, monthRows, out)
                Spacer(Modifier.height(12.dp))
            }
            if (vm.month == model.thisMonth && !filtered && (model.queue.count > 0 || model.queue.merchants.isNotEmpty())) {
                NeedsALook(model.queue.count, openReview)
                Spacer(Modifier.height(12.dp))
            }
            if (rows.isEmpty()) Quiet(if (filtered) "Nothing matches." else "No transactions this month.")
        }
        val days = rows.groupBy { it.day() }.toList()
        days.forEachIndexed { i, (d, dayRows) ->
            item(key = "day-$d") {
                val total = dayRows.sumOf { spendOf(it, model.cardIds) }
                Row(
                    Modifier.fillMaxWidth()
                        .clip(if (i == 0) RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp) else RoundedCornerShape(0.dp))
                        .background(Ink.band).padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Text(dayHeading(d), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                    if (total > 0) Text(rupees(total), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.muted)
                }
            }
            items(dayRows, key = { it.id }) { t ->
                val last = i == days.lastIndex && t == dayRows.last()
                TxnRow(t, model, last) { selected = t }
            }
        }
    }

    selected?.let { t -> TxnSheet(t, model, vm, openStatement) { selected = null } }
}

@Composable
private fun MoneyHeader(vm: AppViewModel, m: MoneyModel, count: Int, out: Double) {
    var open by remember { mutableStateOf(false) }
    val months = remember(m) {
        (listOf(m.thisMonth) + m.ledger.map { YearMonth.from(it.day()) }).distinct().sortedDescending().take(12)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text("Money", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            Text(
                monthLong(vm.month) + " · $count transactions · " + rupees(out) + " out",
                fontSize = 12.sp, color = Ink.muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Box {
            JButton(monthShortName(vm.month) + " ▾", style = ButtonStyle.OUTLINE, height = 40.dp, fontSize = 13) { open = true }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Ink.raised) {
                months.forEach { ym ->
                    DropdownMenuItem(
                        text = { Text(monthLong(ym), color = if (ym == vm.month) Ink.accentSoft else Ink.text) },
                        onClick = { vm.month = ym; vm.clearAiFilter(); open = false },
                    )
                }
            }
        }
    }
}

/** Search as you type; press enter on a question and Jarvis turns it into filters. */
@Composable
private fun AskBox(vm: AppViewModel) {
    Row(
        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).background(Ink.surface)
            .border(1.dp, Ink.accent.copy(alpha = 0.4f), RoundedCornerShape(24.dp)).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Filled.AutoAwesome, null, tint = Ink.accentLift, modifier = Modifier.size(16.dp))
        Box(Modifier.weight(1f)) {
            if (vm.query.isEmpty()) Text("Search, or ask: food over ₹500 last week", fontSize = 14.sp, color = Ink.dim, maxLines = 1)
            BasicTextField(
                value = vm.query,
                onValueChange = { vm.query = it },
                singleLine = true,
                textStyle = TextStyle(color = Ink.text, fontSize = 14.sp),
                cursorBrush = SolidColor(Ink.accentLift),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    // One word is a search; a phrase is a question worth the model's time.
                    if (vm.query.trim().contains(' ')) vm.askFilter(vm.query)
                }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (vm.filterBusy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.accentLift)
        else if (vm.query.isNotEmpty()) Icon(Icons.Filled.Close, "Clear", tint = Ink.dim, modifier = Modifier.size(18.dp).clickable { vm.query = "" })
    }
}

@Composable
private fun FilterChips(vm: AppViewModel) {
    val f = vm.aiFilter
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        vm.categoryFilter?.let { c -> ActiveChip(c) { vm.categoryFilter = null } }
        if (f != null) {
            val parts = listOfNotNull(
                f.category,
                f.direction?.let { if (it == "CREDIT") "money in" else "money out" },
                f.minAmount?.let { "over " + rupees(it) },
                f.maxAmount?.let { "under " + rupees(it) },
                if (f.from != null || f.to != null) listOfNotNull(f.from?.let { dayMonth(LocalDate.parse(it)) }, f.to?.let { dayMonth(LocalDate.parse(it)) }).joinToString("–") else null,
                f.text?.takeIf { it.isNotBlank() }?.let { "“$it”" },
            )
            ActiveChip("✦ " + (parts.joinToString(" · ").ifEmpty { vm.aiFilterQuery ?: "filter" })) { vm.clearAiFilter() }
        } else if (vm.query.isEmpty() && vm.categoryFilter == null) {
            FILTER_EXAMPLES.forEach { AskChip(it, enabled = !vm.filterBusy) { vm.askFilter(it) } }
        }
    }
}

@Composable
private fun ActiveChip(text: String, onClear: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(99.dp)).background(Ink.accentWell).clickable(onClick = onClear).padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft, maxLines = 1)
        Spacer(Modifier.width(4.dp))
        Icon(Icons.Filled.Close, "Remove filter", tint = Ink.accentSoft, modifier = Modifier.size(14.dp))
    }
}

@Composable
private fun MonthStrip(m: MoneyModel, ym: YearMonth, rows: List<TransactionDto>, out: Double) {
    val daysSoFar = if (ym == m.thisMonth) m.today.dayOfMonth else ym.lengthOfMonth()
    val inflow = rows.sumOf { earningOf(it, m.cardIds) }
    val inToday = rows.filter { it.day() == m.today }.sumOf { earningOf(it, m.cardIds) }
    val payments = rows.filter { it.direction == "DEBIT" && it.realFlow }
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(16.dp)).background(Ink.surface)
            .border(1.dp, Ink.hairline, RoundedCornerShape(16.dp)),
    ) {
        GridCell("OUT", lakh(out), rupees(out / daysSoFar.coerceAtLeast(1)) + " a day")
        GridCell(
            "IN", lakh(inflow),
            if (inToday > 0) "+" + lakh(inToday) + " today" else rows.count { earningOf(it, m.cardIds) > 0 }.let { "$it credit" + if (it == 1) "" else "s" },
            subColor = if (inToday > 0) Ink.accentSoft else Ink.dim,
        )
        GridCell(
            "PAYMENTS", payments.size.toString(),
            if (payments.isEmpty()) null else "median " + rupees(median(payments.map { it.amount })),
            divider = false,
        )
    }
}

@Composable
private fun NeedsALook(count: Int, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ink.warn.copy(alpha = 0.08f))
            .border(1.dp, Ink.warn.copy(alpha = 0.25f), RoundedCornerShape(16.dp)).clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Ink.warn.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
            Text(if (count > 0) count.toString() else "✦", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Ink.warn)
        }
        Column(Modifier.weight(1f)) {
            Text("Needs a look", fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(
                if (count > 0) "Jarvis has a suggestion for each" else "Ask Jarvis to check this month's categories",
                fontSize = 12.sp, color = Ink.muted,
            )
        }
        Text("›", fontSize = 18.sp, color = Ink.warn)
    }
}

@Composable
private fun TxnRow(t: TransactionDto, m: MoneyModel, last: Boolean, onClick: () -> Unit) {
    val name = merchantLabel(t)
    val recurring = remember(m, t.id) {
        m.x.recurring.firstOrNull { r -> r.merchant != null && t.merchant != null && merchantKey(r.merchant) == merchantKey(t.merchant) }
    }
    val fix = m.queue.wrong.firstOrNull { f -> f.rows.any { it.id == t.id } }
    val credit = t.direction == "CREDIT"
    Row(
        Modifier.fillMaxWidth()
            .clip(if (last) RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp) else RoundedCornerShape(0.dp))
            .background(Ink.surface).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val big = t.amount >= 10_000 && recurring == null && !credit
        Avatar(initials(name), fg = if (big) Ink.warn else Ink.accentSoft, bg = if (big) Ink.warn.copy(alpha = 0.15f) else Ink.accentWell)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (recurring != null) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        recurring.cadence.lowercase(), fontSize = 10.sp, color = Ink.muted,
                        modifier = Modifier.border(1.dp, Ink.hairlineStrong, RoundedCornerShape(99.dp)).padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
            val meta = buildAnnotatedString {
                if (fix != null) {
                    withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(t.category ?: "") }
                    append(" ")
                    withStyle(SpanStyle(color = Ink.accentSoft, fontWeight = FontWeight.Bold)) { append("✦ " + fix.to + "?") }
                } else {
                    append(
                        listOfNotNull(
                            t.category ?: "Uncategorised",
                            when {
                                t.settlement -> "bill payment"
                                t.transfer -> "transfer"
                                else -> shortAccount(t, m.accountsById)
                            },
                            t.originalCurrency?.let { c -> t.originalAmount?.let { "$c " + String.format(java.util.Locale.US, "%.2f", it) } },
                        ).joinToString(" · ")
                    )
                }
            }
            Text(meta, fontSize = 12.sp, color = Ink.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Money(
            (if (credit) "+" else "") + rupees(t.amount), size = 14, weight = FontWeight.ExtraBold,
            color = if (credit) Ink.in_ else if (!t.realFlow) Ink.muted else Ink.text,
        )
    }
    if (!last) Hairline(Modifier.background(Ink.surface))
}

/** One transaction: what it is, where it was paid from, and its category, changeable here. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TxnSheet(t: TransactionDto, m: MoneyModel, vm: AppViewModel, openStatement: (Long) -> Unit, onDismiss: () -> Unit) {
    var always by remember { mutableStateOf(false) }
    JSheet(onDismiss) {
        Text(merchantLabel(t), fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
        Money((if (t.direction == "CREDIT") "+" else "") + rupees(t.amount), size = 30, weight = FontWeight.ExtraBold, color = if (t.direction == "CREDIT") Ink.in_ else Ink.text)
        Text(
            listOfNotNull(dayHeading(t.day()), shortAccount(t, m.accountsById), t.source?.lowercase(), t.merchant?.takeIf { it != merchantLabel(t) }).joinToString(" · "),
            fontSize = 12.sp, color = Ink.muted,
        )
        t.note?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp, color = Ink.muted) }
        m.statementFor(t.accountId ?: -1)?.let { s ->
            JButton("View " + s.name + " statement", Modifier.fillMaxWidth(), ButtonStyle.SOFT, height = 42.dp, fontSize = 13) {
                onDismiss(); openStatement(s.summary.accountId)
            }
        }
        SectionLabel("Category")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            (listOfNotNull(t.category) + CATEGORIES).distinct().forEach { c ->
                Chip(c, c == t.category) {
                    if (c != t.category) {
                        vm.recategorise(listOf(t.id), c, if (always && t.merchant != null) t.merchant else null)
                        onDismiss()
                    }
                }
            }
        }
        if (t.merchant != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(always, { always = it }, colors = CheckboxDefaults.colors(checkedColor = Ink.accent, uncheckedColor = Ink.dim))
                Text("Always file " + merchantLabel(t) + " there", fontSize = 13.sp, color = Ink.muted)
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Needs a look
// ---------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReviewSheet(vm: AppViewModel, onDismiss: () -> Unit) {
    val m by vm.model.collectAsState()
    val model = m ?: return
    val q = model.queue
    JSheet(onDismiss) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Needs a look", fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            if (q.count > 0) Pill(q.count.toString(), Ink.warn, size = 12)
        }
        Text("Accept what looks right. A correction can become a rule, so it won't ask again.", fontSize = 13.sp, color = Ink.muted)

        val progress = vm.suggestProgress
        when {
            progress != null -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.accentLift)
                Text("Jarvis is reading merchants… ${progress.first} of ${progress.second}", fontSize = 13.sp, color = Ink.muted)
            }
            else -> JButton("✦ Ask Jarvis to check the merchants", Modifier.fillMaxWidth(), ButtonStyle.SOFT, height = 42.dp, fontSize = 13) { vm.readMerchants(model) }
        }
        vm.suggestNote?.let { Text(it, fontSize = 12.sp, color = Ink.dim) }

        val confident = q.confident
        if (confident.isNotEmpty()) {
            JButton("Accept all confident (${confident.size})", Modifier.fillMaxWidth()) { vm.acceptAllConfident(model) }
        }

        if (q.wrong.isNotEmpty()) {
            SectionLabel("Probably the wrong category", Modifier.padding(top = 6.dp))
            q.wrong.forEach { f ->
                var always by remember(f.key) { mutableStateOf(true) }
                ReviewCard(f.label + " · " + rupees(f.rows.sumOf { it.amount }), dayMonth(f.rows.maxOf { it.day() })) {
                    Text(
                        buildAnnotatedString {
                            append(f.from + " → ")
                            withStyle(SpanStyle(color = Ink.accentSoft, fontWeight = FontWeight.ExtraBold)) { append(f.to) }
                            f.reason?.let { withStyle(SpanStyle(color = Ink.muted)) { append(". $it") } }
                        },
                        fontSize = 13.sp,
                    )
                    Row(Modifier.clickable { always = !always }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(always, { always = it }, colors = CheckboxDefaults.colors(checkedColor = Ink.accent, uncheckedColor = Ink.dim))
                        Text("Always for " + f.label, fontSize = 13.sp, color = Ink.muted)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        JButton("Accept", Modifier.weight(1f), ButtonStyle.SOFT, height = 42.dp) {
                            vm.recategorise(f.rows.map { it.id }, f.to, if (always) f.raw else null)
                        }
                        JButton("Keep " + f.from, Modifier.weight(1f), ButtonStyle.OUTLINE, height = 42.dp) { vm.dismiss(listOf(f.key)) }
                    }
                }
            }
        }

        if (q.people.isNotEmpty()) {
            SectionLabel("Paid to a person", Modifier.padding(top = 6.dp))
            q.people.forEach { t ->
                ReviewCard(merchantLabel(t) + " · " + rupees(t.amount), dayMonth(t.day())) {
                    Text("Filed as \"Transfers\", which reads like your own money moving. What was it?", fontSize = 13.sp, color = Ink.muted)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("Food", "Family support", "Rent", "Groceries").forEach { c ->
                            OutlineChoice(c) { vm.recategorise(listOf(t.id), c, dismissKey = "person:${t.id}") }
                        }
                        OutlineChoice("My own account") { vm.dismiss(listOf("person:${t.id}")) }
                    }
                }
            }
        }

        if (q.loose.isNotEmpty()) {
            SectionLabel("No category yet", Modifier.padding(top = 6.dp))
            q.loose.forEach { l ->
                val t = l.txn
                ReviewCard(merchantLabel(t) + " · " + rupees(t.amount), dayMonth(t.day())) {
                    if (t.accountId == null && !isUncategorised(t)) {
                        Text("Not linked to an account. Add the account on the web, then relink.", fontSize = 13.sp, color = Ink.muted)
                        JButton("Fine as it is", Modifier.fillMaxWidth(), ButtonStyle.OUTLINE, height = 40.dp) { vm.dismiss(listOf("row:${t.id}")) }
                    } else {
                        if (l.suggested != null) {
                            Text(
                                buildAnnotatedString {
                                    append("Jarvis thinks ")
                                    withStyle(SpanStyle(color = Ink.accentSoft, fontWeight = FontWeight.ExtraBold)) { append(l.suggested) }
                                    l.reason?.let { withStyle(SpanStyle(color = Ink.muted)) { append(". $it") } }
                                },
                                fontSize = 13.sp,
                            )
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            (listOfNotNull(l.suggested) + listOf("Food", "Shopping", "Groceries", "Transport", "Bills & Utilities")).distinct().forEach { c ->
                                OutlineChoice(c, highlighted = c == l.suggested) { vm.recategorise(listOf(t.id), c) }
                            }
                        }
                    }
                }
            }
        }

        if (q.count == 0 && progress == null) Quiet("Nothing needs a look this month.")
        Text(
            "Suggestions come from Jarvis on your PC · nothing leaves home",
            fontSize = 12.sp, color = Ink.dim, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun ReviewCard(title: String, date: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth(), border = Ink.raised, background = Ink.raised, padding = PaddingValues(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(date, fontSize = 12.sp, color = Ink.dim)
        }
        content()
    }
}

@Composable
private fun OutlineChoice(text: String, highlighted: Boolean = false, onClick: () -> Unit) {
    Text(
        text,
        Modifier.height(38.dp).clip(RoundedCornerShape(99.dp))
            .background(if (highlighted) Ink.accentWell else androidx.compose.ui.graphics.Color.Transparent)
            .border(1.dp, if (highlighted) Ink.accent.copy(alpha = 0.5f) else Ink.hairlineStrong, RoundedCornerShape(99.dp))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 9.dp),
        fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (highlighted) Ink.accentSoft else Ink.text,
    )
}

// ---------------------------------------------------------------------------------------------
// Card statement
// ---------------------------------------------------------------------------------------------

@Composable
fun StatementSheet(vm: AppViewModel, accountId: Long, onDismiss: () -> Unit) {
    val m by vm.model.collectAsState()
    val model = m ?: return
    val s = model.statementFor(accountId) ?: return
    var tab by remember { mutableStateOf(0) }
    var showAll by remember { mutableStateOf(false) }
    val sum = s.summary
    JSheet(onDismiss) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CardStack(s)
            Column(Modifier.weight(1f)) {
                Text(s.name, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    s.members.joinToString(" · ") { listOfNotNull(networkShort(it.network), it.last4).joinToString(" ") },
                    fontSize = 12.sp, color = Ink.muted, maxLines = 1,
                )
            }
        }
        val due = s.dueOn
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Outstanding on this bill", fontSize = 12.sp, color = Ink.muted)
                Money(rupees(sum.billDue), size = 34, weight = FontWeight.ExtraBold)
            }
            if (due != null && sum.billDue > 0) {
                val days = daysTo(due)
                Pill(
                    "Due " + dayMonth(due) + " · " + when {
                        days < 0 -> "overdue"
                        days == 0L -> "today"
                        else -> "in $days day" + if (days == 1L) "" else "s"
                    },
                    if (days <= 3) Ink.out else Ink.accentSoft, size = 12,
                )
            }
        }
        val last = s.lastStatementOn
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).border(1.dp, Ink.hairlineStrong, RoundedCornerShape(14.dp)),
        ) {
            GridCell("Billed", rupees(sum.billed), last?.let { dayMonth(it.minusMonths(1)) + "–" + dayMonth(it.minusDays(1)) })
            GridCell("Paid", rupees(sum.paid), "since statement")
            GridCell("Outstanding", rupees(sum.billDue), due?.let { "by " + dayMonth(it) }, highlight = true, divider = false)
        }
        val paidId = vm.paidJustNow[sum.accountId]
        when {
            paidId != null -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("✓ Marked paid. The bank's alert will confirm it.", fontSize = 13.sp, color = Ink.in_, modifier = Modifier.weight(1f))
                JButton("Undo", style = ButtonStyle.OUTLINE, height = 40.dp, busy = vm.cardBusy) { vm.undoCardPaid(sum.accountId) }
            }
            sum.billDue > 0 -> JButton("I've paid this bill", Modifier.fillMaxWidth(), height = 48.dp, fontSize = 15, busy = vm.cardBusy) {
                vm.markCardPaid(sum.accountId, sum.billDue)
            }
        }

        s.nextStatementOn?.let { next ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionLabel("Next statement · " + dayMonth(next), Modifier.weight(1f))
                Money(rupees(sum.unbilled) + " unbilled", size = 13, weight = FontWeight.ExtraBold)
            }
        }
        if (s.members.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                s.members.forEach { c ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Ink.raised).padding(horizontal = 10.dp, vertical = 9.dp)) {
                        Text(listOfNotNull(networkShort(c.network), c.last4).joinToString(" "), fontSize = 11.sp, color = Ink.muted)
                        Money(rupees(c.unbilled), size = 13, weight = FontWeight.ExtraBold)
                    }
                }
            }
        }
        sum.utilisationPct?.let { pct ->
            Column {
                Bar(pct / 100f, if (pct >= 70) Ink.out else if (pct >= 30) Ink.warn else Ink.in_)
                Spacer(Modifier.height(6.dp))
                Row {
                    Text(
                        "$pct% of " + (sum.creditLimit?.let { lakh(it) } ?: "the limit") + if (s.members.size > 1) " shared limit" else " limit",
                        fontSize = 11.sp, color = Ink.dim, modifier = Modifier.weight(1f),
                    )
                    if (sum.lastPaidAmount != null && sum.lastPaidOn != null) {
                        Text("last paid " + rupees(sum.lastPaidAmount) + " · " + dayMonth(LocalDate.parse(sum.lastPaidOn.take(10))), fontSize = 11.sp, color = Ink.dim)
                    }
                }
            }
        }

        val onBill = last?.let { purchasesBetween(model.ledger, s.accountIds, it.minusMonths(1), it.minusDays(1)) }.orEmpty()
        val since = last?.let { purchasesBetween(model.ledger, s.accountIds, it, model.today) }.orEmpty()
        Segmented(listOf("On this bill · ${onBill.size}", "Since · ${since.size}", "Past"), tab, background = Ink.raised) { tab = it; showAll = false }
        when (tab) {
            0, 1 -> {
                val rows = if (tab == 0) onBill else since
                val shown = if (showAll) rows else rows.take(6)
                if (rows.isEmpty()) Quiet(if (last == null) "The statement dates are not known yet." else "Nothing on it.")
                shown.forEach { t -> StatementLine(t) }
                if (!showAll && rows.size > shown.size) {
                    val rest = rows.drop(shown.size)
                    Text(
                        "+ ${rest.size} more · " + rupees(rest.sumOf { if (it.direction == "DEBIT") it.amount else -it.amount }),
                        fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink.accentSoft,
                        modifier = Modifier.clickable { showAll = true }.padding(vertical = 10.dp),
                    )
                }
            }
            else -> {
                val past = pastStatements(s, model.ledger)
                if (past.isEmpty()) Quiet("No earlier bills in the phone's copy of the ledger.")
                past.forEach { p ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Statement " + dayMonth(p.on), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text(dayMonth(p.from) + "–" + dayMonth(p.to) + " · paid " + rupees(p.paid), fontSize = 11.sp, color = Ink.dim)
                        }
                        Money(rupees(p.billed), size = 13, weight = FontWeight.ExtraBold, color = if (p.paid + 1 >= p.billed) Ink.text else Ink.warn)
                    }
                    Hairline()
                }
            }
        }
    }
}

@Composable
private fun StatementLine(t: TransactionDto) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(dayMonth(t.day()), fontSize = 13.sp, color = Ink.dim, modifier = Modifier.width(48.dp))
        Text(
            buildAnnotatedString {
                append(merchantLabel(t))
                val oc = t.originalCurrency
                if (oc != null && t.originalAmount != null) withStyle(SpanStyle(color = Ink.dim)) { append(" · $oc " + t.originalAmount.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }) }
            },
            fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Money((if (t.direction == "CREDIT") "−" else "") + rupees(t.amount), size = 13, weight = FontWeight.ExtraBold, color = if (t.direction == "CREDIT") Ink.in_ else Ink.text)
    }
    Hairline()
}

/** The cards on a statement, fanned like a hand. */
@Composable
private fun CardStack(s: Statement) {
    val n = s.members.size.coerceAtMost(3)
    Box(Modifier.width((40 + 8 * (n - 1)).dp).height(30.dp)) {
        s.members.take(3).forEachIndexed { i, c ->
            Box(Modifier.padding(start = (8 * i).dp).width(40.dp).height(30.dp).clip(RoundedCornerShape(6.dp)).background(networkColour(c.network)))
        }
    }
}

private fun networkShort(n: String?): String? = when (n?.uppercase()) {
    "MASTERCARD" -> "MC"
    "AMEX" -> "Amex"
    "VISA" -> "Visa"
    "RUPAY" -> "RuPay"
    null -> null
    else -> n
}
