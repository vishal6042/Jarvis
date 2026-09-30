package com.jarvis.sync.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.CreateTransactionDto
import com.jarvis.sync.data.ReceiptDto
import com.jarvis.sync.finance.CATEGORIES
import com.jarvis.sync.ui.theme.Ink
import java.time.LocalDate
import java.time.ZoneId

/** What the add sheet opens with: blank, a screenshot's reading, or an SMS Jarvis could not read. */
data class AddPrefill(
    val amount: Double? = null,
    val merchant: String? = null,
    val category: String? = null,
    val direction: String = "DEBIT",
    val method: String? = null,
    val occurredOn: String? = null,
    /** The category came from the model, so say so. */
    val guessed: Boolean = false,
) {
    companion object {
        fun of(r: ReceiptDto) = AddPrefill(r.amount, r.merchant, r.category, r.direction, r.method, r.occurredOn, guessed = r.category != null)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AddSheet(vm: AppViewModel, prefill: AddPrefill, onDismiss: () -> Unit) {
    val m by vm.model.collectAsState()
    var direction by remember { mutableStateOf(prefill.direction) }
    var amount by remember { mutableStateOf(prefill.amount?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "") }
    var merchant by remember { mutableStateOf(prefill.merchant ?: "") }
    var category by remember { mutableStateOf(prefill.category ?: "Food") }
    var guessed by remember { mutableStateOf(prefill.guessed) }
    var occurredOn by remember { mutableStateOf(prefill.occurredOn) }
    var more by remember { mutableStateOf(false) }
    val accounts = m?.accounts.orEmpty()
    var accountId by remember(accounts) {
        mutableStateOf(defaultAccount(ReceiptDto(method = prefill.method), m)?.id ?: accounts.firstOrNull { it.type == "SAVINGS" }?.id)
    }
    LaunchedEffect(Unit) { vm.clearAddError() }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.scanImage(uri) { r, _ ->
            r.amount?.let { amount = if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }
            r.merchant?.let { merchant = it }
            r.category?.let { category = it; guessed = true }
            direction = r.direction
            occurredOn = r.occurredOn
            defaultAccount(r, m)?.let { accountId = it.id }
        }
    }

    JSheet(onDismiss) {
        Text("Add a transaction", fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ink.accentWell)
                .border(1.dp, Ink.accent.copy(alpha = 0.55f), RoundedCornerShape(16.dp))
                .clickable(enabled = !vm.scanBusy) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Ink.accent), contentAlignment = Alignment.Center) {
                if (vm.scanBusy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                else Icon(Icons.Filled.PhotoCamera, null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(if (vm.scanBusy) "Reading it on your PC…" else "Scan a screenshot or receipt", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                Text("Jarvis reads it on your PC and fills this in", fontSize = 12.sp, color = Ink.muted)
            }
        }
        vm.scanError?.let { Text(it, fontSize = 12.sp, color = Ink.out) }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Toggle("Spent", direction == "DEBIT", Ink.out, Modifier.weight(1f)) { direction = "DEBIT" }
            Toggle("Received", direction == "CREDIT", Ink.in_, Modifier.weight(1f)) { direction = "CREDIT" }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Amount", fontSize = 12.sp, color = Ink.muted)
            Row(
                Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(14.dp)).background(Ink.raised).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("₹", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink.dim)
                BasicTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { c -> c.isDigit() || c == '.' } },
                    singleLine = true,
                    textStyle = TextStyle(color = Ink.text, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold),
                    cursorBrush = SolidColor(Ink.accentLift),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (direction == "DEBIT") "Paid to" else "Received from", fontSize = 12.sp, color = Ink.muted)
            Box(
                Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(Ink.raised).padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (merchant.isEmpty()) Text("e.g. chai and auto", fontSize = 15.sp, color = Ink.dim)
                BasicTextField(
                    value = merchant, onValueChange = { merchant = it }, singleLine = true,
                    textStyle = TextStyle(color = Ink.text, fontSize = 15.sp), cursorBrush = SolidColor(Ink.accentLift),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "Category" + if (guessed) " · ✦ Jarvis guessed $category" else "",
                fontSize = 12.sp, color = if (guessed) Ink.accentSoft else Ink.muted,
            )
            val quick = (listOf(category) + listOf("Food", "Transport", "Groceries", "Shopping")).distinct()
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                (if (more) (quick + CATEGORIES).distinct() else quick).forEach { c -> Chip(c, c == category) { category = c; guessed = false } }
                if (!more) Chip("More…", false) { more = true }
            }
        }
        if (accounts.size > 1) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("From", fontSize = 12.sp, color = Ink.muted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("Cash", accountId == null) { accountId = null }
                    accounts.forEach { a -> Chip(accountName(a), accountId == a.id) { accountId = a.id } }
                }
            }
        }
        occurredOn?.let { d -> Text("On " + com.jarvis.sync.finance.dayMonth(LocalDate.parse(d)), fontSize = 12.sp, color = Ink.dim) }
        vm.addError?.let { Text(it, fontSize = 12.sp, color = Ink.out) }
        val value = amount.toDoubleOrNull()
        JButton("Save", Modifier.fillMaxWidth(), height = 50.dp, fontSize = 15, enabled = value != null && value > 0, busy = vm.addBusy) {
            vm.addTransaction(
                CreateTransactionDto(
                    accountId = accountId,
                    amount = value!!,
                    direction = direction,
                    merchant = merchant.ifBlank { null },
                    category = category,
                    occurredAt = occurredOn?.let { LocalDate.parse(it).atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toString() },
                ),
                onDone = onDismiss,
            )
        }
    }
}

@Composable
private fun Toggle(text: String, on: Boolean, colour: Color, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(12.dp))
            .then(if (on) Modifier.background(colour.copy(alpha = 0.14f)) else Modifier.border(1.dp, Ink.hairlineStrong, RoundedCornerShape(12.dp)))
            .clickable(onClick = onClick).padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = if (on) FontWeight.ExtraBold else FontWeight.Bold, color = if (on) colour else Ink.muted)
    }
}
