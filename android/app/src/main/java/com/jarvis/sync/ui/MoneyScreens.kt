package com.jarvis.sync.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.CardSummaryDto
import com.jarvis.sync.ui.theme.Ink
import com.jarvis.sync.data.InvestmentDto
import com.jarvis.sync.data.TransactionDto
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

private val DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("dd MMM")

/** Categories offered when re-categorising on the phone; the web app has the full editor. */
private val CATEGORIES = listOf(
    "Food", "Groceries", "Shopping", "Transport", "Bills & Utilities", "Entertainment",
    "Health", "Travel", "Education", "Rent", "Investments", "Loan EMI", "Card Payment",
    "Transfers", "Income", "Miscellaneous",
)

/**
 * The money tab: what the cards owe right now, then every transaction with a month filter and a
 * search box. Tapping a row re-categorises it, which is the one edit worth making on a phone.
 */
@Composable
fun MoneyScreen(vm: AppViewModel) {
    val cache by vm.dashboard.collectAsState()
    val extras = cache?.let { vm.extras(it) }
    LaunchedEffect(Unit) { vm.loadTransactions() }

    var editing by remember { mutableStateOf<TransactionDto?>(null) }
    editing?.let { t ->
        CategoryPicker(
            current = t.category,
            onDismiss = { editing = null },
            onPick = { c ->
                vm.setCategory(t.id, c)
                editing = null
            },
        )
    }

    val accounts = extras?.accounts.orEmpty()
    val owned = vm.accountIdsOf(vm.member, accounts)
    val rows = vm.visibleTransactions(owned)
    val listState = rememberLazyListState()

    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Money")
        OutlinedTextField(
            value = vm.txnQuery,
            onValueChange = { vm.txnQuery = it },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = Ink.dim, modifier = Modifier.size(18.dp)) },
            placeholder = { Text("Search merchant, category, account", color = Ink.dim, fontSize = 14.sp) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Ink.surface,
                unfocusedContainerColor = Ink.surface,
                focusedBorderColor = Ink.accentLift,
                unfocusedBorderColor = Ink.hairline,
                cursorColor = Ink.accentLift,
                focusedTextColor = Ink.text,
                unfocusedTextColor = Ink.text,
            ),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        )
        Spacer(Modifier.height(14.dp))
        // Someone confined to one person has nothing to choose between: everything they can see is
        // already theirs, so the chips would only offer empty answers.
        val admin by vm.isAdmin.collectAsState()
        val members = if (admin) extras?.members.orEmpty() else emptyList()
        if (members.size > 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Chip("Everyone", vm.member == null) { vm.member = null }
                members.forEach { m -> Chip(m.name, vm.member == m.id) { vm.member = m.id } }
            }
            Spacer(Modifier.height(6.dp))
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Chip("All", vm.txnMonth == "all") { vm.txnMonth = "all" }
            vm.months().take(12).forEach { m -> Chip(monthLabel(m), vm.txnMonth == m) { vm.txnMonth = m } }
        }
        Spacer(Modifier.height(8.dp))

        LazyColumn(Modifier.fillMaxSize(), state = listState) {
            val cards = extras?.cards.orEmpty().filter { owned.isEmpty() || it.accountId in owned }
            if (cards.isNotEmpty()) {
                item { SectionHeader("Cards") }
                items(cards, key = { it.accountId }) { CardBillRow(it) }
                item { Spacer(Modifier.height(8.dp)) }
            }
            val holdings = extras?.holdings.orEmpty().filter { vm.member == null || it.memberId == vm.member }
            if (holdings.isNotEmpty()) {
                item {
                    SectionHeader("Investments") {
                        Text(
                            inr(holdings.sumOf { it.current }),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Ink.in_,
                        )
                    }
                }
                items(holdings, key = { "inv-" + it.id }) { HoldingRow(it) }
                item { Spacer(Modifier.height(8.dp)) }
            }
            item {
                SectionHeader("Transactions") {
                    if (vm.txnsBusy) {
                        CircularProgressIndicator(Modifier.width(14.dp).height(14.dp), strokeWidth = 2.dp)
                    } else {
                        Text(
                            rows.size.toString(),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Ink.dim,
                        )
                    }
                }
            }
            if (rows.isEmpty() && !vm.txnsBusy) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) {
                        Text("Nothing here.", color = Ink.dim)
                    }
                }
            }
            items(rows, key = { it.id }) { t -> TransactionRow(t) { editing = t } }
        }
    }
}

/**
 * A band that separates one part of the list from the next. Set apart from the rows below it on
 * every axis that matters — a tinted ground, a rule above, small capitals with wide tracking —
 * because at a glance a bold sentence-case line reads as just another entry.
 */
@Composable
private fun SectionHeader(title: String, trailing: @Composable (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(color = Ink.hairline)
        SectionBand(title, trailing = trailing)
        HorizontalDivider(color = Ink.hairline)
    }
}

@Composable
private fun CardBillRow(c: CardSummaryDto) {
    val due = c.billDue > 0
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // A long card name and a long amount cannot both have the row: the name gives way with
            // an ellipsis, because the amount is the thing being read.
            Text(
                c.displayName,
                fontWeight = FontWeight.SemiBold,
                color = Ink.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                if (due) inr(c.billDue) else "Nothing due",
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                color = if (due) Ink.out else Ink.in_,
            )
        }
        Row {
            Text(
                buildString {
                    append(inr(c.unbilled)).append(" unbilled")
                    c.dueOn?.let { append(" · due ").append(shortDate(it)) }
                    if (c.billingGroup != null) append(" · shared bill")
                },
                fontSize = 12.sp,
                color = Ink.dim,
                modifier = Modifier.weight(1f),
            )
            c.utilisationPct?.let {
                Text(it.toString() + "% used", fontSize = 12.sp, color = Ink.dim)
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun HoldingRow(i: InvestmentDto) {
    val gain = i.current - i.principal
    val pct = if (i.principal > 0) gain / i.principal * 100 else 0.0
    // An endowment pays only at maturity, so its value is still just what went in. Showing 0%
    // there would read as a bad investment rather than as an unknown.
    val unvalued = i.current == i.principal
    val yearly = i.contributionFrequency == "yearly"
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                i.name,
                fontWeight = FontWeight.SemiBold,
                color = Ink.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            Text(inr(i.current), fontWeight = FontWeight.Bold, color = Ink.text, maxLines = 1)
        }
        Row {
            Text(
                buildString {
                    append(i.kind)
                    append(" · ").append(inr(i.principal)).append(" in")
                    val sip = i.sip ?: 0.0
                    if (sip > 0) {
                        append(" · ").append(inr(sip)).append(if (yearly) "/yr" else "/mo")
                        if (i.salaryDeducted) append(" from salary")
                    }
                },
                fontSize = 12.sp,
                color = Ink.dim,
                modifier = Modifier.weight(1f),
            )
            if (unvalued) {
                Text("not valued yet", fontSize = 12.sp, color = Ink.dim)
            } else {
                Text(
                    (if (gain >= 0) "+" else "") + inr(gain) + " (" + String.format(java.util.Locale.US, "%.1f", pct) + "%)",
                    fontSize = 12.sp,
                    color = if (gain >= 0) Ink.in_ else Ink.out,
                )
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun TransactionRow(t: TransactionDto, onClick: () -> Unit) {
    val income = t.direction == "CREDIT"
    val on = runCatching { LocalDate.parse(t.occurredAt.take(10)) }.getOrNull()
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (on != null) {
            DayStamp(
                on.dayOfMonth.toString().padStart(2, '0'),
                on.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault()),
            )
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                t.merchantNorm ?: t.merchant ?: "—",
                fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink.text, maxLines = 1,
            )
            Spacer(Modifier.height(3.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Tag(t.category ?: "Uncategorised")
                val aside = when {
                    t.settlement -> "bill payment"
                    t.transfer -> "transfer"
                    else -> t.accountName
                }
                if (aside != null) Text(aside, fontSize = 11.sp, color = Ink.dim, maxLines = 1)
            }
        }
        Spacer(Modifier.width(10.dp))
        Money(
            (if (income) "+" else "−") + inr(t.amount).removePrefix("-"),
            size = 14,
            color = if (income) Ink.in_ else Ink.text,
        )
    }
    Rule(startInset = 72)
}

@Composable
private fun CategoryPicker(current: String?, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Category") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                CATEGORIES.forEach { c ->
                    Text(
                        c,
                        fontWeight = if (c == current) FontWeight.Bold else FontWeight.Normal,
                        color = if (c == current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.fillMaxWidth().clickable { onPick(c) }.padding(vertical = 10.dp),
                    )
                }
            }
        },
    )
}

/**
 * Ask Jarvis. The agent runs on the home machine, so an answer can take a while; the thread stays
 * readable and the reply lands when it arrives.
 */
@Composable
fun AskScreen(vm: AppViewModel) {
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(vm.chat.size) { if (vm.chat.isNotEmpty()) listState.animateScrollToItem(vm.chat.size - 1) }

    val suggestions = listOf(
        "How much can I spend this month?",
        "What bills are due this week?",
        "When will I be debt free?",
        "Where did my money go this month?",
    )

    Column(Modifier.fillMaxSize()) {
        // The header stays put; only the thread and the input give way to the keyboard. Padding the
        // whole screen took the title up with it, which is not what a chat should do.
        ScreenHeader("Ask")
        Column(Modifier.weight(1f).fillMaxWidth().imePadding()) {
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState) {
            items(vm.chat) { m -> ChatBubble(m) }
            if (vm.chatBusy) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.accentLift)
                        Spacer(Modifier.width(10.dp))
                        Text("Thinking…", color = Ink.dim, fontSize = 13.sp)
                    }
                }
            }
            if (vm.chat.size <= 1) {
                item {
                    Column(
                        Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        suggestions.forEach { s ->
                            Box(
                                Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .border(1.dp, Ink.accentLift.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                                    .clickable { vm.ask(s) }
                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                            ) {
                                Text(s, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink.accentSoft)
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Ask about your money…", color = Ink.dim, fontSize = 14.sp) },
                singleLine = true,
                shape = RoundedCornerShape(23.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Ink.surface,
                    unfocusedContainerColor = Ink.surface,
                    focusedBorderColor = Ink.accentLift,
                    unfocusedBorderColor = Ink.hairlineStrong,
                    cursorColor = Ink.accentLift,
                    focusedTextColor = Ink.text,
                    unfocusedTextColor = Ink.text,
                ),
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = {
                    vm.ask(input)
                    input = ""
                }),
            )
            val ready = input.isNotBlank() && !vm.chatBusy
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(23.dp))
                    .background(if (ready) Ink.accent else Ink.well)
                    .clickable(enabled = ready) {
                        vm.ask(input)
                        input = ""
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Send, "Send",
                    tint = if (ready) Color.White else Ink.dim,
                    modifier = Modifier.size(19.dp),
                )
            }
        }
        }
    }
}

/**
 * A turn in the thread. What the user said is a violet bubble tucked to the right; what Jarvis
 * says is not a bubble at all — an answer that runs to several sentences reads better as text on
 * the page, with the mark beside it to say who is speaking.
 */
@Composable
private fun ChatBubble(m: AppViewModel.ChatMessage) {
    if (m.fromUser) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                Modifier
                    .fillMaxWidth(0.82f)
                    .clip(RoundedCornerShape(18.dp, 18.dp, 5.dp, 18.dp))
                    .background(Ink.accent)
                    .padding(horizontal = 15.dp, vertical = 11.dp),
            ) {
                Text(m.text, color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, lineHeight = 21.sp)
            }
        }
    } else {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Box(
                Modifier.size(26.dp).clip(RoundedCornerShape(9.dp)).background(Ink.accentWell),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.AutoAwesome, null,
                    tint = Ink.accentSoft, modifier = Modifier.size(14.dp),
                )
            }
            // The agent answers in Markdown; without this the asterisks and dashes were printed.
            MarkdownText(m.text, Modifier.weight(1f))
        }
    }
}

// ---- helpers shared by these screens ----

/** Rupees with Indian digit grouping (1,23,456). */
internal fun inr(v: Double): String {
    val n = Math.round(v)
    val s = Math.abs(n).toString()
    val grouped = if (s.length <= 3) s else {
        s.dropLast(3).reversed().chunked(2).joinToString(",").reversed() + "," + s.takeLast(3)
    }
    return (if (n < 0) "-₹" else "₹") + grouped
}

internal fun shortDate(iso: String): String =
    runCatching { LocalDate.parse(iso.take(10)).format(DAY_MONTH) }.getOrDefault(iso.take(10))

private fun monthLabel(ym: String): String =
    runCatching { YearMonth.parse(ym).format(DateTimeFormatter.ofPattern("MMM yy")) }.getOrDefault(ym)
