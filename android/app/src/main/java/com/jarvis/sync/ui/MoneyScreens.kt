package com.jarvis.sync.ui

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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.CardSummaryDto
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
        OutlinedTextField(
            value = vm.txnQuery,
            onValueChange = { vm.txnQuery = it },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            placeholder = { Text("Search merchant, category, account") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        val members = extras?.members.orEmpty()
        if (members.size > 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = vm.member == null,
                    onClick = { vm.member = null },
                    label = { Text("Everyone") },
                )
                members.forEach { m ->
                    FilterChip(
                        selected = vm.member == m.id,
                        onClick = { vm.member = m.id },
                        label = { Text(m.name) },
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = vm.txnMonth == "all",
                onClick = { vm.txnMonth = "all" },
                label = { Text("All") },
            )
            vm.months().take(12).forEach { m ->
                FilterChip(
                    selected = vm.txnMonth == m,
                    onClick = { vm.txnMonth = m },
                    label = { Text(monthLabel(m)) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))

        LazyColumn(Modifier.fillMaxSize(), state = listState) {
            val cards = extras?.cards.orEmpty().filter { owned.isEmpty() || it.accountId in owned }
            if (cards.isNotEmpty()) {
                item {
                    Text(
                        "Cards",
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                    )
                }
                items(cards, key = { it.accountId }) { CardBillRow(it) }
                item { Spacer(Modifier.height(8.dp)) }
            }
            val holdings = extras?.holdings.orEmpty().filter { vm.member == null || it.memberId == vm.member }
            if (holdings.isNotEmpty()) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Investments", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(
                            inr(holdings.sumOf { it.current }),
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF10B981),
                        )
                    }
                }
                items(holdings, key = { "inv-" + it.id }) { HoldingRow(it) }
                item { Spacer(Modifier.height(8.dp)) }
            }
            item {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Transactions", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    if (vm.txnsBusy) {
                        CircularProgressIndicator(Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text(rows.size.toString(), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (rows.isEmpty() && !vm.txnsBusy) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) {
                        Text("Nothing here.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            items(rows, key = { it.id }) { t -> TransactionRow(t) { editing = t } }
        }
    }
}

@Composable
private fun CardBillRow(c: CardSummaryDto) {
    val due = c.billDue > 0
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(c.displayName, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(
                if (due) inr(c.billDue) else "Nothing pending",
                fontWeight = FontWeight.Bold,
                color = if (due) Color(0xFFF43F5E) else Color(0xFF10B981),
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
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            c.utilisationPct?.let {
                Text(it.toString() + "% used", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            Text(i.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(inr(i.current), fontWeight = FontWeight.Bold)
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
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (unvalued) {
                Text("not valued yet", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(
                    (if (gain >= 0) "+" else "") + inr(gain) + " (" + String.format(java.util.Locale.US, "%.1f", pct) + "%)",
                    fontSize = 12.sp,
                    color = if (gain >= 0) Color(0xFF10B981) else Color(0xFFF43F5E),
                )
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun TransactionRow(t: TransactionDto, onClick: () -> Unit) {
    val income = t.direction == "CREDIT"
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.merchantNorm ?: t.merchant ?: "—", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(
                (if (income) "+" else "") + inr(t.amount),
                fontWeight = FontWeight.Bold,
                color = if (income) Color(0xFF10B981) else MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            buildString {
                append(shortDate(t.occurredAt))
                append(" · ").append(t.category ?: "Uncategorised")
                t.accountName?.let { append(" · ").append(it) }
                if (t.settlement) append(" · bill payment") else if (t.transfer) append(" · transfer")
            },
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    HorizontalDivider()
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

    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState) {
            items(vm.chat) { m -> ChatBubble(m) }
            if (vm.chatBusy) {
                item {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("Thinking…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                }
            }
            if (vm.chat.size <= 1) {
                item {
                    Column(Modifier.padding(16.dp)) {
                        suggestions.forEach { s ->
                            Surface(
                                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                                shape = RoundedCornerShape(20.dp),
                                modifier = Modifier.padding(bottom = 8.dp).clickable { vm.ask(s) },
                            ) {
                                Text(s, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp))
                            }
                        }
                    }
                }
            }
        }
        HorizontalDivider()
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Ask about your money…") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = {
                    vm.ask(input)
                    input = ""
                }),
            )
            IconButton(
                onClick = {
                    vm.ask(input)
                    input = ""
                },
                enabled = input.isNotBlank() && !vm.chatBusy,
            ) { Icon(Icons.Filled.Send, "Send") }
        }
    }
}

@Composable
private fun ChatBubble(m: AppViewModel.ChatMessage) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = if (m.fromUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = if (m.fromUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(0.86f),
        ) {
            Text(
                m.text,
                color = if (m.fromUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                modifier = Modifier.padding(12.dp),
            )
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
