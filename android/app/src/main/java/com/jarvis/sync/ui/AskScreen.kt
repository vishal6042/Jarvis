package com.jarvis.sync.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.ReceiptDto
import com.jarvis.sync.data.VisualDto
import com.jarvis.sync.finance.BriefCell
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.dayHeading
import com.jarvis.sync.finance.dayMonth
import com.jarvis.sync.finance.lakh
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.ui.theme.Ink
import java.time.LocalDate

private val STARTERS = listOf(
    "How much can I spend this month?",
    "Where did my money go this month?",
    "What bills are due this week?",
    "When will I be debt-free?",
)

@Composable
fun AskScreen(vm: AppViewModel, onEditReceipt: (ReceiptDto) -> Unit) {
    val m by vm.model.collectAsState()
    var input by remember { mutableStateOf("") }
    var history by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    LaunchedEffect(vm.chat.size, vm.chatBusy) {
        val last = vm.chat.size + (if (vm.chatBusy) 1 else 0)
        if (last > 0) list.animateScrollToItem(last)
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.askAboutImage(uri)
    }
    val send = {
        if (input.isNotBlank() && !vm.chatBusy) {
            vm.ask(input)
            input = ""
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text("Ask", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
                Text("Runs on your PC · nothing leaves home", fontSize = 12.sp, color = Ink.muted)
            }
            if (vm.chat.isNotEmpty()) IconSquare(Icons.Filled.Add, "New chat") { vm.newChat() }
            IconSquare(Icons.Filled.History, "Chat history") { vm.loadChatList(); history = true }
        }
        Column(Modifier.weight(1f).fillMaxWidth().imePadding()) {
            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                state = list,
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    val model = m
                    if (vm.chat.isEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            if (model != null) Brief(model)
                            SectionLabel("Try asking")
                            @OptIn(ExperimentalLayoutApi::class)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                STARTERS.forEach { s -> AskChip(s, enabled = !vm.chatBusy) { vm.ask(s) } }
                            }
                        }
                    }
                }
                itemsIndexed(vm.chat) { i, msg -> Turn(vm, i, msg, m, onEditReceipt) }
                if (vm.chatBusy) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Mark()
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.accentLift)
                            Text("Thinking… the model on your PC can take a minute", fontSize = 13.sp, color = Ink.dim)
                        }
                    }
                }
            }
            Composer(vm, input, { input = it }, send) {
                pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        }
    }

    if (history) {
        JSheet({ history = false }) {
            Text("Conversations", fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
            Text("Shared with the web app: pick one up on either.", fontSize = 13.sp, color = Ink.muted)
            JButton("New chat", Modifier.fillMaxWidth(), ButtonStyle.SOFT) { vm.newChat(); history = false }
            if (vm.chatList.isEmpty()) Quiet("No saved conversations yet.")
            vm.chatList.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { vm.openChat(c.id); history = false }.padding(vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(c.title, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${c.messages} messages · " + (runCatching { dayMonth(java.time.Instant.parse(c.updatedAt).atZone(java.time.ZoneId.systemDefault()).toLocalDate()) }.getOrDefault("")),
                            fontSize = 12.sp, color = Ink.dim,
                        )
                    }
                    Text("›", fontSize = 18.sp, color = Ink.dim)
                }
                Hairline()
            }
        }
    }
}

/** Four facts before anyone asks: coming in, due this week, yesterday, and what to watch. */
@Composable
private fun Brief(m: MoneyModel) {
    Hero(Modifier.fillMaxWidth()) {
        Text(
            "✦ YOUR BRIEF · " + dayHeading(LocalDate.now()).uppercase(),
            fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp, color = Ink.muted,
        )
        m.brief.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { c ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Ink.heroCell).padding(11.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(c.label, fontSize = 11.sp, color = Ink.muted)
                        Text(c.value, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 18.sp)
                        c.sub?.let { Text(it, fontSize = 12.sp, color = if (c.tone == BriefCell.Tone.PLAIN) Ink.muted else toneColour(c.tone), maxLines = 2) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Mark() {
    Box(Modifier.size(26.dp).clip(RoundedCornerShape(99.dp)).background(Ink.accentWell), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.AutoAwesome, null, tint = Ink.accentSoft, modifier = Modifier.size(13.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Turn(vm: AppViewModel, index: Int, msg: AppViewModel.ChatMessage, m: MoneyModel?, onEditReceipt: (ReceiptDto) -> Unit) {
    if (msg.fromUser) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (msg.image != null || msg.text.isEmpty()) {
                Box(
                    Modifier.width(130.dp).height(90.dp).clip(RoundedCornerShape(12.dp)).background(Ink.raised)
                        .border(1.dp, Ink.hairlineStrong, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    val img = msg.image
                    if (img != null) Image(img.asImageBitmap(), "Attached screenshot", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Ink.accentLift)
                }
            } else {
                Text(
                    msg.text,
                    Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(18.dp, 18.dp, 5.dp, 18.dp)).background(Ink.accent)
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, lineHeight = 20.sp,
                )
            }
        }
        return
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Mark()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (msg.receipt != null) {
                ReceiptCard(vm, index, msg.receipt, msg.receiptAdded, m, onEditReceipt)
            } else {
                if (msg.text.isNotBlank()) MarkdownText(msg.text, Modifier.fillMaxWidth())
                msg.visuals.forEach { VisualCard(it) }
                if (msg.followUps.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        msg.followUps.forEach { q -> AskChip(q, enabled = !vm.chatBusy) { vm.ask(q) } }
                    }
                }
            }
        }
    }
}

/**
 * The figures behind an answer, drawn: a headline figure, or rows with bars. A row that also has
 * an "of" is drawn twice — thick for this time, thin for the usual — the way the canvas draws it.
 */
@Composable
private fun VisualCard(v: VisualDto) {
    Card(Modifier.fillMaxWidth(), padding = PaddingValues(13.dp), gap = 9.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(v.title, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Ink.muted, modifier = Modifier.weight(1f))
            v.amount?.let { Money(rupees(it), size = 13, weight = FontWeight.ExtraBold) }
        }
        v.subtitle?.let { Text(it, fontSize = 12.sp, color = Ink.dim) }
        if (v.kind == "stat") {
            v.amount?.let { Money(rupees(it), size = 24, weight = FontWeight.ExtraBold) }
        }
        val pts = v.points.take(8)
        val max = pts.maxOfOrNull { maxOf(it.value ?: 0.0, if (v.kind == "progress") 0.0 else it.of ?: 0.0) }?.coerceAtLeast(1.0) ?: 1.0
        val earn = v.tone == "earn"
        pts.forEach { p ->
            Column {
                Row {
                    Text(p.label, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        (p.value?.let { rupees(it) } ?: "—") + (p.of?.let { " / " + lakh(it) } ?: ""),
                        fontSize = 12.sp, fontWeight = FontWeight.ExtraBold,
                    )
                }
                val value = p.value ?: 0.0
                if (v.kind == "progress" && p.of != null && p.of > 0) {
                    Spacer(Modifier.height(4.dp))
                    Bar((value / p.of).toFloat(), if (earn) Ink.in_ else Ink.accentLift, height = 6.dp)
                } else if (v.kind != "list" && v.kind != "stat") {
                    val over = p.of != null && value > p.of && !earn
                    Spacer(Modifier.height(4.dp))
                    Bar((value / max).toFloat(), if (over) Ink.warn else if (earn) Ink.in_ else Ink.accentLift, height = 6.dp, track = Color.Transparent)
                    if (p.of != null) {
                        Spacer(Modifier.height(2.dp))
                        Bar((p.of / max).toFloat(), Ink.faint, height = 3.dp, track = Color.Transparent)
                    }
                }
                p.note?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 11.sp, color = Ink.dim) }
            }
        }
        if (pts.any { it.of != null } && v.kind != "progress") Text("Thick: this time · thin: the usual", fontSize = 11.sp, color = Ink.dim)
        v.caption?.let { Text(it, fontSize = 12.sp, color = Ink.dim) }
    }
}

@Composable
private fun ReceiptCard(vm: AppViewModel, index: Int, r: ReceiptDto, added: Boolean, m: MoneyModel?, onEdit: (ReceiptDto) -> Unit) {
    val account = remember(r, m) { defaultAccount(r, m) }
    Card(Modifier.fillMaxWidth(), border = Ink.accent.copy(alpha = 0.4f), padding = PaddingValues(14.dp)) {
        Text(if (added) "✓ Added" else "From the screenshot · add it?", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = if (added) Ink.in_ else Ink.accentSoft)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Paid to", r.merchant ?: "—", Modifier.weight(1f))
            Field("Amount", r.amount?.let { rupees(it) } ?: "—", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("From", listOfNotNull(account?.let { accountName(it) }, r.method).joinToString(" · ").ifEmpty { "—" }, Modifier.weight(1f))
            Field("Category", (r.category ?: "—") + " ✦", Modifier.weight(1f))
        }
        r.occurredOn?.let { Text("On " + dayMonth(LocalDate.parse(it)), fontSize = 12.sp, color = Ink.dim) }
        if (!added) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                JButton("Add it", Modifier.weight(1f), height = 42.dp) { vm.addReceipt(index, r, account?.id) }
                JButton("Edit", Modifier.weight(1f), ButtonStyle.OUTLINE, height = 42.dp) { onEdit(r) }
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String, modifier: Modifier) {
    Column(modifier) {
        Text(label, fontSize = 11.sp, color = Ink.dim)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Where a screenshot's payment most likely came from: a card for a card payment, else the bank. */
internal fun defaultAccount(r: ReceiptDto, m: MoneyModel?): com.jarvis.sync.data.AccountDto? {
    val accounts = m?.accounts.orEmpty()
    return when (r.method) {
        "CASH" -> null
        "CARD" -> accounts.firstOrNull { it.type != "SAVINGS" }
        else -> accounts.firstOrNull { it.type == "SAVINGS" }
    }
}

internal fun accountName(a: com.jarvis.sync.data.AccountDto): String =
    listOfNotNull(a.bank?.split(" ")?.firstOrNull(), a.last4).joinToString(" ").ifBlank { a.displayName ?: "Account" }

@Composable
private fun Composer(vm: AppViewModel, input: String, onInput: (String) -> Unit, send: () -> Unit, attach: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Ink.ground).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ScopeChips(vm)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(99.dp)).background(Ink.surface).border(1.dp, Ink.hairlineStrong, RoundedCornerShape(99.dp))
                    .clickable(enabled = !vm.chatBusy, onClick = attach),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.AttachFile, "Attach a screenshot or receipt", tint = Ink.muted, modifier = Modifier.size(18.dp)) }
            Box(
                Modifier.weight(1f).height(46.dp).clip(RoundedCornerShape(23.dp)).background(Ink.surface)
                    .border(1.dp, Ink.hairlineStrong, RoundedCornerShape(23.dp)).padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (input.isEmpty()) Text("Ask anything…", fontSize = 14.sp, color = Ink.dim)
                BasicTextField(
                    value = input,
                    onValueChange = onInput,
                    singleLine = true,
                    textStyle = TextStyle(color = Ink.text, fontSize = 14.sp),
                    cursorBrush = SolidColor(Ink.accentLift),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { send() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            val ready = input.isNotBlank() && !vm.chatBusy
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(99.dp)).background(if (ready) Ink.accent else Ink.well).clickable(enabled = ready, onClick = send),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.ArrowUpward, "Send", tint = if (ready) Color.White else Ink.dim, modifier = Modifier.size(19.dp)) }
        }
    }
}

/** What a question is about: the period, and whose money. Either can be taken off. */
@Composable
private fun ScopeChips(vm: AppViewModel) {
    var open by remember { mutableStateOf(false) }
    val member = vm.memberScopeName() ?: "All members"
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val p = vm.period
        Box {
            ScopeChip(p?.label ?: "+ Period", on = p != null, onClick = { open = true }, onClear = { vm.period = null })
            DropdownMenu(open, { open = false }, containerColor = Ink.raised) {
                AppViewModel.Period.entries.forEach { e ->
                    DropdownMenuItem(text = { Text(e.label) }, onClick = { vm.period = e; open = false })
                }
            }
        }
        ScopeChip(if (vm.scopeMember) member else "+ $member", on = vm.scopeMember, onClick = { vm.scopeMember = true }, onClear = { vm.scopeMember = false })
    }
}

@Composable
private fun ScopeChip(text: String, on: Boolean, onClick: () -> Unit, onClear: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(99.dp))
            .then(if (on) Modifier.background(Ink.accentWell) else Modifier.border(1.dp, Ink.hairlineStrong, RoundedCornerShape(99.dp)))
            .clickable(onClick = onClick).padding(start = 10.dp, end = if (on) 4.dp else 10.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = if (on) Ink.accentSoft else Ink.dim)
        if (on) {
            Spacer(Modifier.width(2.dp))
            Icon(Icons.Filled.Close, "Remove", tint = Ink.accentSoft, modifier = Modifier.size(20.dp).clip(RoundedCornerShape(99.dp)).clickable(onClick = onClear).padding(4.dp))
        }
    }
}
