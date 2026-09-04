package com.jarvis.sync.ui

import com.jarvis.sync.data.FinanceScoreDto

import androidx.compose.material.icons.filled.Lightbulb

import androidx.compose.material.icons.filled.AutoAwesome

import com.jarvis.sync.data.AccountDto

import androidx.compose.material.icons.automirrored.filled.TrendingUp

import androidx.compose.material.icons.filled.ShoppingCart

import androidx.compose.material.icons.filled.Savings

import androidx.compose.material.icons.filled.Home

import androidx.compose.material.icons.filled.CreditCard

import androidx.compose.material.icons.filled.AccountBalanceWallet

import androidx.compose.material.icons.filled.AccountBalance

import com.jarvis.sync.data.DashboardExtras

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.compose.material3.FloatingActionButton

import androidx.compose.material3.BadgedBox

import androidx.compose.material3.Badge

import androidx.compose.material3.AlertDialog

import androidx.compose.material.icons.filled.Notifications

import androidx.compose.material.icons.filled.Add

import androidx.compose.material.icons.automirrored.filled.ArrowBack

import androidx.compose.foundation.layout.FlowRow

import androidx.compose.foundation.layout.ExperimentalLayoutApi

import androidx.compose.foundation.clickable

import androidx.compose.foundation.background

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material.icons.filled.Sms
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.sms.SmsFilter
import java.time.YearMonth
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.data.db.DashboardCache
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.data.db.SyncLogEntry
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Date
import java.util.Locale

private val inr: NumberFormat = NumberFormat.getIntegerInstance(Locale("en", "IN"))
private fun money(v: Double): String = "₹" + inr.format(v)
private fun monthShort(minusMonths: Long = 0) =
    LocalDate.now().minusMonths(minusMonths).month.getDisplayName(TextStyle.SHORT, Locale.getDefault())

/** Root: choose login vs. main based on the persisted session (works offline). */
@Composable
fun AppRoot(vm: AppViewModel, hasSmsPermission: Boolean, onRequestPermissions: () -> Unit) {
    when (val s = vm.session.collectAsState().value) {
        is SessionUi.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
        is SessionUi.LoggedOut -> LoginScreen(vm)
        is SessionUi.LoggedIn -> MainScaffold(vm, s.session, hasSmsPermission, onRequestPermissions)
    }
}

@Composable
private fun LoginScreen(vm: AppViewModel) {
    var baseUrl by remember { mutableStateOf("http://") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Jarvis Sync", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text("Forward transaction SMS to your Jarvis server", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = baseUrl,
                onValueChange = { baseUrl = it },
                label = { Text("Server URL") },
                placeholder = { Text("http://192.168.1.5:8080") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )

            vm.loginError?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { vm.login(baseUrl, username, password) },
                enabled = !vm.loginBusy && baseUrl.length > 8 && username.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (vm.loginBusy) "Signing in…" else "Sign in")
            }
        }
    }
}

private data class Tab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(
    vm: AppViewModel,
    session: SessionEntity,
    hasSmsPermission: Boolean,
    onRequestPermissions: () -> Unit,
) {
    val tabs = listOf(
        Tab("Dashboard", Icons.Filled.Dashboard),
        Tab("Inbox", Icons.Filled.Sms),
        Tab("History", Icons.Filled.History),
        Tab("Settings", Icons.Filled.Settings),
    )
    var selected by remember { mutableIntStateOf(0) }
    var alertsOpen by remember { mutableStateOf(false) }
    var addOpen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        vm.loadAlerts()
        vm.startAlertStream()
        vm.loadAccounts()
    }

    if (addOpen) {
        QuickAddDialog(vm, onDismiss = { addOpen = false })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (alertsOpen) "Alerts" else tabs[selected].label) },
                navigationIcon = {
                    if (alertsOpen) {
                        IconButton(onClick = { alertsOpen = false }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
                    }
                },
                actions = {
                    if (!alertsOpen) {
                        IconButton(onClick = { alertsOpen = true; vm.loadAlerts() }) {
                            BadgedBox(badge = { if (vm.unreadAlerts > 0) Badge { Text(vm.unreadAlerts.toString()) } }) {
                                Icon(Icons.Filled.Notifications, "Alerts")
                            }
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (!alertsOpen && selected == 0) {
                FloatingActionButton(onClick = { addOpen = true }) { Icon(Icons.Filled.Add, "Add expense") }
            }
        },
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { i, tab ->
                    NavigationBarItem(
                        selected = selected == i,
                        onClick = { selected = i },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                alertsOpen -> AlertsScreen(vm)
                selected == 0 -> DashboardScreen(vm)
                selected == 1 -> InboxScreen(vm, hasSmsPermission, onRequestPermissions)
                selected == 2 -> HistoryScreen(vm)
                else -> SettingsScreen(vm, session, hasSmsPermission, onRequestPermissions)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardScreen(vm: AppViewModel) {
    val cache by vm.dashboard.collectAsState()
    LaunchedEffect(Unit) { vm.refreshDashboard() }

    PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = { vm.refreshDashboard() }, modifier = Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("This month", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (vm.refreshing) {
                CircularProgressIndicator(Modifier.width(20.dp).height(20.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = { vm.refreshDashboard() }) { Icon(Icons.Filled.Refresh, "Refresh") }
            }
        }
        if (vm.offline) {
            Text(
                "Offline — showing last synced values",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
        }
        Spacer(Modifier.height(12.dp))

        val c = cache
        if (c != null) {
            FinanceScoreSection(vm.extras(c)?.score, vm.refreshing)
            Spacer(Modifier.height(12.dp))
        }
        if (c == null) {
            Box(Modifier.fillMaxWidth().height(160.dp), Alignment.Center) {
                Text(if (vm.refreshing) "Loading…" else "Pull the refresh button to load your dashboard.")
            }
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FancyStat("Net worth", money(c.netWorth), CardTints.purple, CardTints.purpleAccent, Icons.Filled.AccountBalanceWallet, Modifier.weight(1f))
                FancyStat("Spend · ${monthShort()}", money(c.monthSpend), CardTints.rose, CardTints.roseAccent, Icons.Filled.ShoppingCart, Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FancyStat("Earning · ${monthShort(1)}", money(c.lastMonthEarning), CardTints.green, CardTints.greenAccent, Icons.AutoMirrored.Filled.TrendingUp, Modifier.weight(1f))
                FancyStat("Savings rate", "${c.savingsRate}%", CardTints.blue, CardTints.blueAccent, Icons.Filled.Savings, Modifier.weight(1f))
            }

            vm.extras(c)?.accounts?.takeIf { it.isNotEmpty() }?.let { AccountsRow(it) }

            val cats = vm.topCategories(c)
            if (cats.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                Text("Top categories", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(4.dp)) {
                        cats.forEachIndexed { i, cat ->
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(cat.category, Modifier.weight(1f))
                                Text(money(cat.total), fontWeight = FontWeight.SemiBold)
                            }
                            if (i < cats.lastIndex) HorizontalDivider()
                        }
                    }
                }
            }
            vm.extras(c)?.let { x -> DashboardExtrasSections(x) }

            Spacer(Modifier.height(8.dp))
            Text(
                "Updated ${relativeTime(c.updatedAt)}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(72.dp)) // keep the last row clear of the FAB
        }
    }
    }
}

/** Jarvis's AI finance score: a gauge, one-word rating, headline and tips (cached; re-scored when inputs change). */
@Composable
private fun FinanceScoreSection(score: FinanceScoreDto?, refreshing: Boolean) {
    val accent = when (score?.rating?.lowercase()) {
        "excellent" -> CardTints.greenAccent
        "good" -> CardTints.tealAccent
        "fair" -> CardTints.goldAccent
        null -> CardTints.purpleAccent
        else -> CardTints.roseAccent
    }
    val tint = when (score?.rating?.lowercase()) {
        "excellent" -> CardTints.green
        "good" -> CardTints.teal
        "fair" -> CardTints.gold
        null -> CardTints.purple
        else -> CardTints.rose
    }
    FancyCard(tint, accent, Icons.Filled.AutoAwesome, Modifier.fillMaxWidth()) {
        Column {
            Text("Finance score", fontWeight = FontWeight.SemiBold, color = Color.White)
            Text("Your financial health, assessed by Jarvis", fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
            Spacer(Modifier.height(12.dp))
            if (score == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (refreshing) {
                        CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp, color = accent)
                        Spacer(Modifier.width(10.dp))
                        Text("Analyzing your finances…", fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f))
                    } else {
                        Text("Score not available yet — pull to refresh once the AI service is running.",
                            fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f))
                    }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ScoreGauge(score.score, accent)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(score.rating, color = accent, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Text(score.headline, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }
                if (score.tips.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    score.tips.take(3).forEach { tip ->
                        Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Filled.Lightbulb, null, tint = accent, modifier = Modifier.padding(top = 2.dp).width(14.dp).height(14.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(tip, fontSize = 12.sp, color = Color.White.copy(alpha = 0.85f))
                        }
                    }
                }
            }
        }
    }
}

/** Circular gauge: score out of 100, arc coloured by the rating. */
@Composable
private fun ScoreGauge(score: Int, accent: Color) {
    Box(Modifier.width(72.dp).height(72.dp), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val stroke = 7.dp.toPx()
            drawArc(Color.White.copy(alpha = 0.15f), -90f, 360f, false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round))
            drawArc(accent, -90f, 360f * score.coerceIn(0, 100) / 100f, false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(score.toString(), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("/ 100", fontSize = 9.sp, color = Color.White.copy(alpha = 0.7f))
        }
    }
}

/** Upcoming payments, investments, loan, and the latest transactions — all from the cached extras. */
@Composable
private fun DashboardExtrasSections(x: DashboardExtras) {
    if (x.upcoming.isNotEmpty()) {
        Spacer(Modifier.height(20.dp))
        Text("Upcoming · next 30 days", fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(4.dp)) {
                x.upcoming.forEachIndexed { i, u ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(u.title)
                            Text(dueLabel(u.on) + (u.type?.let { " · " + it.lowercase().replaceFirstChar(Char::uppercase) } ?: ""),
                                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (u.amount != null) Text(money(u.amount), fontWeight = FontWeight.SemiBold)
                    }
                    if (i < x.upcoming.lastIndex) HorizontalDivider()
                }
            }
        }
    }

    if (x.invested > 0 || x.loanOutstanding > 0) {
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (x.invested > 0) {
                val gain = x.investmentValue - x.invested
                val pct = if (x.invested > 0) gain / x.invested * 100 else 0.0
                FancyCard(CardTints.teal, CardTints.tealAccent, Icons.AutoMirrored.Filled.TrendingUp, Modifier.weight(1f)) {
                    Column {
                        Text("Investments", fontSize = 12.sp, color = Color.White.copy(alpha = 0.75f))
                        Spacer(Modifier.height(6.dp))
                        Text(money(x.investmentValue), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Text((if (gain >= 0) "+" else "-") + money(kotlin.math.abs(gain)) + " (" + String.format(Locale.US, "%.1f", pct) + "%)",
                            fontSize = 12.sp, color = if (gain >= 0) Color(0xFF34D399) else Color(0xFFFB7185))
                    }
                }
            }
            if (x.loanOutstanding > 0) {
                FancyCard(CardTints.orange, CardTints.orangeAccent, Icons.Filled.Home, Modifier.weight(1f)) {
                    Column {
                        Text("Loan outstanding", fontSize = 12.sp, color = Color.White.copy(alpha = 0.75f))
                        Spacer(Modifier.height(6.dp))
                        Text(money(x.loanOutstanding), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("EMI " + money(x.loanEmi) + (x.loanEmisLeft?.let { " · $it left" } ?: ""),
                            fontSize = 12.sp, color = Color.White.copy(alpha = 0.75f))
                    }
                }
            }
        }
    }

    if (x.recent.isNotEmpty()) {
        Spacer(Modifier.height(20.dp))
        Text("Recent transactions", fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(4.dp)) {
                x.recent.forEachIndexed { i, t ->
                    val debit = t.direction == "DEBIT"
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.merchant?.takeIf { it.isNotBlank() } ?: t.category ?: "Transaction", maxLines = 1)
                            Text(
                                listOfNotNull(t.occurredAt.take(10), t.category, t.accountName,
                                    if (t.transfer) "transfer" else if (t.settlement) "bill payment" else null).joinToString(" · "),
                                fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                            )
                        }
                        Text((if (debit) "-" else "+") + money(t.amount), fontWeight = FontWeight.SemiBold,
                            color = if (t.transfer || t.settlement) MaterialTheme.colorScheme.onSurfaceVariant else if (debit) Color(0xFFF43F5E) else Color(0xFF10B981))
                    }
                    if (i < x.recent.lastIndex) HorizontalDivider()
                }
            }
        }
    }
}

/** Horizontal strip of the user's accounts and cards, tinted like the web Accounts page. */
@Composable
private fun AccountsRow(accounts: List<AccountDto>) {
    Spacer(Modifier.height(20.dp))
    Text("Accounts & cards", fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(8.dp))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(accounts, key = { it.id }) { a ->
            val savings = a.type == "SAVINGS"
            val (tint, accent) = if (savings) CardTints.savings to CardTints.savingsAccent else CardTints.forNetwork(a.network)
            FancyCard(
                tint, accent, if (savings) Icons.Filled.AccountBalance else Icons.Filled.CreditCard,
                Modifier.width(230.dp).height(120.dp),
            ) {
                Column(Modifier.fillMaxSize()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(a.displayName ?: ((a.bank ?: "") + " •••• " + (a.last4 ?: "")), fontWeight = FontWeight.SemiBold,
                            color = Color.White, fontSize = 14.sp, maxLines = 1, modifier = Modifier.weight(1f))
                        TintBadge(if (savings) "SAVINGS" else "CARD", accent)
                    }
                    Spacer(Modifier.weight(1f))
                    if (savings) {
                        Text("Balance", fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
                        Text(a.balance?.let { money(it) } ?: "—", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    } else {
                        Text(a.network ?: "Credit card", fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
                        Text(a.creditLimit?.let { "Limit " + money(it) } ?: (a.bank ?: "Credit card"),
                            fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White, maxLines = 1)
                    }
                }
            }
        }
    }
}

private fun dueLabel(isoDate: String): String {
    val d = runCatching { LocalDate.parse(isoDate) }.getOrNull() ?: return isoDate
    val days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), d)
    return when {
        days == 0L -> "Due today"
        days == 1L -> "Due tomorrow"
        else -> "Due in $days days · " + d.dayOfMonth + " " + d.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    }
}

/** Quick-add: a cash / missed spend or receipt, posted to Jarvis as a manual transaction. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickAddDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var direction by remember { mutableStateOf("DEBIT") }
    var category by remember { mutableStateOf("Food") }
    var merchant by remember { mutableStateOf("") }
    val savings = remember(vm.accounts) { vm.accounts.filter { it.type == "SAVINGS" } }
    var accountId by remember(savings) { mutableStateOf(savings.firstOrNull()?.id) }
    val categories = listOf("Food", "Shopping", "Bills & Utilities", "Transport", "Entertainment", "Health", "Transfers", "Income", "Uncategorized")
    val value = amount.toDoubleOrNull()

    AlertDialog(
        onDismissRequest = { if (!vm.addBusy) onDismiss() },
        title = { Text("Add transaction") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = direction == "DEBIT", onClick = { direction = "DEBIT" }, label = { Text("Spent") })
                    FilterChip(selected = direction == "CREDIT", onClick = { direction = "CREDIT" }, label = { Text("Received") })
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = amount, onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Amount (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = merchant, onValueChange = { merchant = it },
                    label = { Text("Paid to / note") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text("Category", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    categories.forEach { c ->
                        FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c, fontSize = 12.sp) })
                    }
                }
                if (savings.size > 1) {
                    Spacer(Modifier.height(10.dp))
                    Text("From account", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        savings.forEach { a ->
                            FilterChip(selected = accountId == a.id, onClick = { accountId = a.id },
                                label = { Text(a.displayName ?: ("•••• " + a.id), fontSize = 12.sp) })
                        }
                    }
                }
                vm.addError?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            Button(
                enabled = value != null && value > 0 && !vm.addBusy,
                onClick = { vm.addTransaction(value!!, direction, category, merchant, accountId, null, onDone = onDismiss) },
            ) { Text(if (vm.addBusy) "Saving…" else "Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss, enabled = !vm.addBusy) { Text("Cancel") } },
    )
}

/** Server-side alerts (thresholds, payments due, expiries, sync summaries). */
@Composable
private fun AlertsScreen(vm: AppViewModel) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Alerts", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(if (vm.unreadAlerts > 0) "${vm.unreadAlerts} unread" else "All read",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = { vm.markAllAlertsRead() }, enabled = vm.unreadAlerts > 0) { Text("Mark all read") }
        }
        HorizontalDivider()
        if (vm.alerts.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text("No alerts yet. Budget, EMI and card-expiry alerts appear here.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(vm.alerts, key = { it.id }) { n ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
                        val dot = runCatching { Color(android.graphics.Color.parseColor(n.color ?: "#6366F1")) }.getOrDefault(Color(0xFF6366F1))
                        Box(Modifier.padding(top = 6.dp).width(8.dp).height(8.dp).background(dot, MaterialTheme.shapes.small))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(n.title, fontWeight = if (n.read) FontWeight.Normal else FontWeight.SemiBold)
                            Text(n.message, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(n.createdAt.take(16).replace('T', ' '), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors()) {
        Column(Modifier.padding(16.dp)) {
            Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Every bank/UPI transaction SMS already on the phone, filtered month-wise, with a Sync button that
 * queues the visible ones for Jarvis. Each row shows a cheap on-device read (amount + debit/credit)
 * and, once delivered, the server's verdict.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InboxScreen(vm: AppViewModel, hasSmsPermission: Boolean, onRequestPermissions: () -> Unit) {
    val imported by vm.importedSmsIds.collectAsState()
    val queued by vm.queuedSmsIds.collectAsState()
    val verdicts by vm.smsVerdicts.collectAsState()
    val zone = remember { java.time.ZoneId.systemDefault() }

    LaunchedEffect(hasSmsPermission) { if (hasSmsPermission && vm.inbox.isEmpty()) vm.loadInbox() }

    if (!hasSmsPermission) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(48.dp))
            Text("SMS permission needed", fontWeight = FontWeight.SemiBold)
            Text("Grant SMS access to list the bank alerts already on this phone.", fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Button(onClick = onRequestPermissions) { Text("Grant permission") }
        }
        return
    }

    val months = remember(vm.inbox) {
        vm.inbox.map { YearMonth.from(Date(it.receivedAt).toInstant().atZone(zone)) }.distinct().sortedDescending()
    }
    var selectedMonth by remember { mutableStateOf<YearMonth?>(null) } // null = All
    LaunchedEffect(months) { if (selectedMonth == null && months.isNotEmpty()) selectedMonth = months.first() }

    val visible = remember(vm.inbox, selectedMonth) {
        val m = selectedMonth
        if (m == null) vm.inbox else vm.inbox.filter { YearMonth.from(Date(it.receivedAt).toInstant().atZone(zone)) == m }
    }
    val unsynced = visible.count { it.id !in imported }

    PullToRefreshBox(isRefreshing = vm.inboxBusy && vm.inbox.isNotEmpty(), onRefresh = { vm.loadInbox() }, modifier = Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Bank SMS", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    when {
                        vm.inboxBusy -> "Working..."
                        vm.inboxError != null -> vm.inboxError!!
                        visible.isEmpty() -> "No transaction SMS found"
                        unsynced == 0 -> "${visible.size} messages, all synced"
                        else -> "${visible.size} messages, $unsynced not synced"
                    },
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = { vm.loadInbox() }, enabled = !vm.inboxBusy) { Icon(Icons.Filled.Refresh, "Rescan") }
            Button(onClick = { vm.syncInbox(visible) }, enabled = unsynced > 0 && !vm.inboxBusy) {
                Text(if (unsynced > 0) "Sync $unsynced" else "Synced")
            }
        }
        if (months.isNotEmpty()) {
            LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(selected = selectedMonth == null, onClick = { selectedMonth = null }, label = { Text("All") })
                }
                items(months) { m ->
                    val label = m.month.getDisplayName(TextStyle.SHORT, Locale.getDefault()) + " " + m.year
                    FilterChip(selected = selectedMonth == m, onClick = { selectedMonth = m }, label = { Text(label) })
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        HorizontalDivider()
        when {
            vm.inboxBusy && vm.inbox.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            visible.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text("No bank transaction SMS in this period.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(visible, key = { it.id }) { sms ->
                    val status = verdicts[sms.id] ?: when {
                        sms.id in queued -> "QUEUED"
                        sms.id in imported -> "SENT"
                        else -> "NEW"
                    }
                    InboxRow(sms, status, verdicts[sms.id]?.let { vm.verdictDetail(sms.id) })
                }
            }
        }
    }
    }
}

@Composable
private fun InboxRow(sms: InboxSms, status: String, detail: String? = null) {
    val amount = remember(sms.id) { SmsFilter.amountOf(sms.body) }
    val direction = remember(sms.id) { SmsFilter.directionOf(sms.body) }
    var expanded by remember(sms.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(sms.sender ?: "SMS", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            if (amount != null) {
                val col = when (direction) {
                    "CREDIT" -> Color(0xFF10B981)
                    "DEBIT" -> Color(0xFFF43F5E)
                    else -> MaterialTheme.colorScheme.onSurface
                }
                Text((if (direction == "CREDIT") "+" else if (direction == "DEBIT") "-" else "") + amount,
                    color = col, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Spacer(Modifier.width(8.dp))
            }
            StatusChip(status)
        }
        Spacer(Modifier.height(4.dp))
        Text(sms.body, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = if (expanded) Int.MAX_VALUE else 3)
        if (expanded && !detail.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("Jarvis: " + detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
        }
        Text(relativeTime(sms.receivedAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryScreen(vm: AppViewModel) {
    val pending by vm.pendingCount.collectAsState()
    val log by vm.log.collectAsState()

    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(refreshing) { if (refreshing) { vm.syncNow(); kotlinx.coroutines.delay(1200); refreshing = false } }
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true }, modifier = Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Sync history", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (pending > 0) "$pending queued, waiting to sync" else "All caught up",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { vm.syncNow() }) { Text("Sync now") }
        }
        HorizontalDivider()
        if (log.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text("Forwarded transaction SMS will appear here.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(log) { entry -> LogRow(entry) }
            }
        }
    }
    }
}

@Composable
private fun LogRow(entry: SyncLogEntry) {
    var expanded by remember(entry.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(entry.sender ?: "SMS", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            StatusChip(entry.status)
        }
        Spacer(Modifier.height(4.dp))
        Text(entry.snippet, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = if (expanded) Int.MAX_VALUE else 2)
        if (expanded && !entry.detail.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("Jarvis: " + entry.detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
        }
        Text(relativeTime(entry.at), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider()
}

@Composable
private fun StatusChip(status: String) {
    val color = when (status) {
        "PARSED" -> Color(0xFF10B981)
        "DUPLICATE" -> Color(0xFF6B7280)
        "IGNORED" -> Color(0xFFF59E0B)
        "NEW" -> Color(0xFF6366F1)
        "QUEUED", "SENT" -> Color(0xFF3B82F6)
        "INVESTMENT" -> Color(0xFF14B8A6)
        else -> Color(0xFFF43F5E) // FAILED / anything else
    }
    Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
        Text(status, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
    }
}

@Composable
private fun SettingsScreen(
    vm: AppViewModel,
    session: SessionEntity,
    hasSmsPermission: Boolean,
    onRequestPermissions: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Settings", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Signed in as ${session.username}", fontWeight = FontWeight.SemiBold)
                Text(session.baseUrl, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(12.dp))

        Card(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Forward SMS", fontWeight = FontWeight.SemiBold)
                    Text("Send new transaction SMS to Jarvis", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = session.forwardingEnabled, onCheckedChange = { vm.setForwarding(it) })
            }
        }
        Spacer(Modifier.height(12.dp))

        if (!hasSmsPermission) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("SMS permission needed", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error)
                    Text("Grant SMS access so new bank alerts can be forwarded.", fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onRequestPermissions) { Text("Grant permission") }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        OutlinedButton(onClick = { vm.syncNow() }, modifier = Modifier.fillMaxWidth()) { Text("Sync now") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth()) { Text("Log out") }

        Spacer(Modifier.height(16.dp))
        Text("Jarvis Sync v1.0", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private val timeFmt = DateTimeFormatter.ofPattern("d MMM, HH:mm")
private fun relativeTime(epochMillis: Long): String {
    val date = Date(epochMillis)
    return timeFmt.format(date.toInstant().atZone(java.time.ZoneId.systemDefault()))
}
