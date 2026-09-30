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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.SmsOutcome
import com.jarvis.sync.finance.SmsRead
import com.jarvis.sync.finance.dayHeading
import com.jarvis.sync.finance.merchantLabel
import com.jarvis.sync.finance.monthShortName
import com.jarvis.sync.finance.readSms
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.sms.SmsFilter
import com.jarvis.sync.ui.theme.Ink
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private fun outcomeColour(o: SmsOutcome): Color = when (o) {
    SmsOutcome.SAVED -> Ink.in_
    SmsOutcome.DEPOSIT -> Ink.accentLift
    SmsOutcome.NOT_PAYMENT -> Ink.dim
    SmsOutcome.FAILED -> Ink.out
    SmsOutcome.TWICE -> Color(0xFF2A2A38)
    SmsOutcome.WAITING -> Ink.accentSoft
}

private val TIME = DateTimeFormatter.ofPattern("HH:mm")

/** The failed messages this phone knows of in the current month: what Home's action counts. */
fun failedSmsCount(vm: AppViewModel): Int {
    val zone = ZoneId.systemDefault()
    val month = YearMonth.now()
    val verdicts = vm.verdicts.value
    return vm.inbox.count { s ->
        YearMonth.from(Instant.ofEpochMilli(s.receivedAt).atZone(zone)) == month &&
            readSms(verdicts[s.id].orEmpty(), false).outcome == SmsOutcome.FAILED
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(vm: AppViewModel, hasSmsPermission: Boolean, onRequestPermissions: () -> Unit, onAddByHand: (Double?) -> Unit) {
    val imported by vm.importedSmsIds.collectAsState()
    val queued by vm.queuedSmsIds.collectAsState()
    val verdicts by vm.verdicts.collectAsState()
    val m by vm.model.collectAsState()
    val zone = remember { ZoneId.systemDefault() }

    LaunchedEffect(hasSmsPermission) { if (hasSmsPermission && vm.inbox.isEmpty()) vm.loadInbox() }

    if (!hasSmsPermission) {
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Bank SMS", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            Card(Modifier.fillMaxWidth()) {
                Text("SMS permission needed", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text("Jarvis reads the bank alerts on this phone and forwards new ones. Nothing else is read.", fontSize = 13.sp, color = Ink.muted)
                JButton("Grant permission", onClick = onRequestPermissions)
            }
        }
        return
    }

    val months = remember(vm.inbox) {
        vm.inbox.map { YearMonth.from(Instant.ofEpochMilli(it.receivedAt).atZone(zone)) }.distinct().sortedDescending()
    }
    var month by remember { mutableStateOf(YearMonth.now()) }
    var problemsOnly by remember { mutableStateOf(false) }
    val inMonth = remember(vm.inbox, month) {
        vm.inbox.filter { YearMonth.from(Instant.ofEpochMilli(it.receivedAt).atZone(zone)) == month }
    }
    val reads = inMonth.associate { s ->
        s.id to readSms(verdicts[s.id].orEmpty(), s.id in queued || (s.id in imported && verdicts[s.id].isNullOrEmpty()))
    }
    val failedIds = reads.filterValues { it.outcome == SmsOutcome.FAILED }.keys
    val unsent = inMonth.filter { it.id !in imported && it.id !in queued }
    val shown = if (problemsOnly) inMonth.filter { it.id in failedIds } else inMonth

    PullToRefreshBox(isRefreshing = vm.inboxBusy && vm.inbox.isNotEmpty(), onRefresh = { vm.loadInbox() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Bank SMS", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
                        Text(
                            when {
                                vm.inboxBusy && vm.inbox.isEmpty() -> "Reading the inbox…"
                                vm.inboxError != null -> vm.inboxError!!
                                inMonth.isEmpty() -> "No bank SMS in " + com.jarvis.sync.finance.monthLong(month)
                                unsent.isEmpty() -> "${inMonth.size} in " + com.jarvis.sync.finance.monthLong(month).substringBefore(" ") + " · all sent to Jarvis"
                                else -> "${inMonth.size} in " + com.jarvis.sync.finance.monthLong(month).substringBefore(" ") + " · ${unsent.size} not sent yet"
                            },
                            fontSize = 12.sp, color = Ink.muted,
                        )
                    }
                    JButton(
                        if (unsent.isEmpty()) "Sync" else "Sync ${unsent.size}", height = 38.dp, fontSize = 13, busy = vm.inboxBusy,
                    ) { if (unsent.isEmpty()) { vm.syncNow(); vm.loadInbox() } else vm.syncInbox(unsent) }
                }
            }
            if (inMonth.isNotEmpty()) item { Summary(reads.values.toList(), failedIds, vm) }
            if (months.isNotEmpty()) item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    months.take(6).forEach { ym ->
                        Chip(monthShortName(ym) + if (ym.year != YearMonth.now().year) " " + ym.year else "", !problemsOnly && ym == month) {
                            month = ym; problemsOnly = false
                        }
                    }
                    if (failedIds.isNotEmpty()) Chip("Only problems", problemsOnly) { problemsOnly = !problemsOnly }
                }
            }
            if (vm.inboxBusy && vm.inbox.isEmpty()) item {
                Box(Modifier.fillMaxWidth().height(160.dp), Alignment.Center) { CircularProgressIndicator(color = Ink.accentLift) }
            }
            val byDay = shown.groupBy { Instant.ofEpochMilli(it.receivedAt).atZone(zone).toLocalDate() }
            byDay.forEach { (d, list) ->
                item(key = "d-$d") { SectionLabel(dayHeading(d)) }
                items(list, key = { it.id }) { sms ->
                    SmsCard(sms, reads[sms.id] ?: SmsRead(SmsOutcome.WAITING, false, null), sms.id in queued, sms.id in imported, m, vm, onAddByHand)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Summary(reads: List<SmsRead>, failedIds: Set<Long>, vm: AppViewModel) {
    val counts = SmsOutcome.entries.associateWith { o -> reads.count { it.outcome == o } }
    Card(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
        SplitBar(
            listOf(SmsOutcome.SAVED, SmsOutcome.DEPOSIT, SmsOutcome.NOT_PAYMENT, SmsOutcome.FAILED, SmsOutcome.WAITING, SmsOutcome.TWICE)
                .map { (counts[it] ?: 0).toDouble() to outcomeColour(it) },
        )
        FlowRow(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(
                SmsOutcome.SAVED to "Saved as a transaction",
                SmsOutcome.DEPOSIT to "Counted as a deposit",
                SmsOutcome.NOT_PAYMENT to "Not a payment",
                SmsOutcome.FAILED to "Couldn't read",
                SmsOutcome.WAITING to "Waiting",
                SmsOutcome.TWICE to "Sent twice, kept once",
            ).forEach { (o, label) ->
                val n = counts[o] ?: 0
                if (n > 0 || o == SmsOutcome.SAVED) {
                    Box(Modifier.fillMaxWidth(0.5f)) {
                        Legend(if (o == SmsOutcome.TWICE) Ink.faint else outcomeColour(o), "$label · $n")
                    }
                }
            }
        }
        if (failedIds.isNotEmpty()) {
            JButton(
                "Retry the ${failedIds.size} it couldn't read", Modifier.fillMaxWidth(), ButtonStyle.DANGER, height = 40.dp, fontSize = 13,
                busy = vm.retryBusy,
            ) { vm.retryFailed(failedIds) }
        }
        vm.retryNote?.let { Text(it, fontSize = 12.sp, color = Ink.muted) }
    }
}

@Composable
private fun SmsCard(
    sms: InboxSms,
    read: SmsRead,
    queued: Boolean,
    imported: Boolean,
    m: MoneyModel?,
    vm: AppViewModel,
    onAddByHand: (Double?) -> Unit,
) {
    var expanded by remember(sms.id) { mutableStateOf(false) }
    val failed = read.outcome == SmsOutcome.FAILED
    val amountText = remember(sms.id) { SmsFilter.amountOf(sms.body) }
    val amount = remember(amountText) {
        amountText?.let { Regex("[0-9][0-9,]*(\\.[0-9]+)?").find(it)?.value?.replace(",", "")?.toDoubleOrNull() }
    }
    val txn = read.verdict?.transactionId?.let { id -> m?.ledger?.firstOrNull { it.id == id } }
    Card(
        Modifier.fillMaxWidth(), border = if (failed) Ink.out.copy(alpha = 0.25f) else Ink.hairline,
        padding = PaddingValues(13.dp), gap = 8.dp, onClick = { expanded = !expanded },
    ) {
        Row {
            Text((sms.sender ?: "SMS").uppercase(), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.6.sp, color = Ink.muted, modifier = Modifier.weight(1f))
            Text(Instant.ofEpochMilli(sms.receivedAt).atZone(ZoneId.systemDefault()).format(TIME), fontSize = 11.sp, color = Ink.dim)
        }
        Text(
            sms.body, fontSize = 13.sp, lineHeight = 19.sp, color = if (failed) Ink.muted else Ink.text,
            maxLines = if (expanded) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis,
        )
        val colour = outcomeColour(read.outcome).let { if (read.outcome == SmsOutcome.TWICE) Ink.dim else it }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(colour.copy(alpha = 0.08f)).padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(Modifier.size(7.dp).clip(RoundedCornerShape(99.dp)).background(colour))
            val words = when (read.outcome) {
                SmsOutcome.SAVED -> "Saved" + (txn?.let { " · " + merchantLabel(it) + " → " + (it.category ?: "Uncategorised") } ?: "")
                SmsOutcome.DEPOSIT -> read.verdict?.detail?.substringBefore(" · ") ?: "Counted as a deposit"
                SmsOutcome.NOT_PAYMENT -> "Not a payment"
                SmsOutcome.FAILED -> if (read.verdict?.detail?.contains("amount", true) == true) "Couldn't read the amount" else "Couldn't read it"
                SmsOutcome.TWICE -> "Sent twice, kept once"
                SmsOutcome.WAITING -> when {
                    queued -> "Queued to send"
                    imported -> "Waiting for Jarvis"
                    else -> "Not sent yet"
                }
            } + if (read.alsoTwice) " · also sent twice" else ""
            Text(words, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = if (expanded) 3 else 1, overflow = TextOverflow.Ellipsis)
            if (failed) {
                Text(
                    "Retry", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft,
                    modifier = Modifier.clickable(enabled = !vm.retryBusy) { vm.retryFailed(listOf(sms.id)) }.padding(4.dp),
                )
                Text("·", fontSize = 12.sp, color = Ink.dim)
                Text(
                    "Add by hand", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft,
                    modifier = Modifier.clickable { onAddByHand(amount) }.padding(4.dp),
                )
            } else {
                val shownAmount = txn?.amount ?: amount
                shownAmount?.let { Money(rupees(it), size = 12, weight = FontWeight.ExtraBold) }
            }
        }
        if (expanded) read.verdict?.detail?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 11.sp, color = Ink.dim) }
    }
}
