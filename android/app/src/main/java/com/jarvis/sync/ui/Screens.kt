package com.jarvis.sync.ui

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.R
import com.jarvis.sync.data.AccountDto
import com.jarvis.sync.data.DashboardExtras
import com.jarvis.sync.data.FinanceScoreDto
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.data.db.SyncLogEntry
import com.jarvis.sync.sms.SmsFilter
import com.jarvis.sync.ui.theme.Ink
import java.text.NumberFormat
import java.time.LocalDate
import java.time.YearMonth
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
        is SessionUi.Loading -> Box(Modifier.fillMaxSize().background(Ink.ground), Alignment.Center) {
            CircularProgressIndicator(color = Ink.accentLift)
        }
        is SessionUi.LoggedOut -> LoginScreen(vm)
        is SessionUi.LoggedIn -> MainScaffold(vm, s.session, hasSmsPermission, onRequestPermissions)
    }
}

/* ------------------------------------------------------------------ shared chrome */

/**
 * A screen's own header. There is no app bar: a title strip that repeats the tab name above the
 * tab bar spends 56dp saying what the highlighted tab already says.
 */
@Composable
internal fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable () -> Unit = {},
) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(34.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Ink.text, modifier = Modifier.size(20.dp))
            }
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, color = Ink.text)
            if (subtitle != null) {
                Text(subtitle, fontSize = 12.sp, color = Ink.dim)
            }
        }
        actions()
    }
}

/** A square icon button in the header strip. */
@Composable
internal fun HeaderButton(icon: ImageVector, label: String, badge: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Ink.surface)
            .border(1.dp, Ink.hairline, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, label, tint = Ink.muted, modifier = Modifier.size(19.dp))
        if (badge) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 9.dp, end = 9.dp)
                    .size(7.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Ink.out),
            )
        }
    }
}

private data class Tab(val label: String, val icon: ImageVector)

/** The tab bar. Selected is the only thing wearing the accent on the whole screen. */
@Composable
private fun JarvisNavBar(tabs: List<Tab>, selected: Int, onSelect: (Int) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Ink.chrome)
            .padding(top = 1.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().background(Ink.chrome).padding(horizontal = 8.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            tabs.forEachIndexed { i, tab ->
                val on = selected == i
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onSelect(i) }
                        .padding(vertical = 5.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(tab.icon, tab.label, tint = if (on) Ink.accentLift else Ink.dim, modifier = Modifier.size(22.dp))
                    Text(
                        tab.label,
                        fontSize = 10.sp,
                        fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                        color = if (on) Ink.accentLift else Ink.dim,
                    )
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ login */

@Composable
private fun LoginScreen(vm: AppViewModel) {
    // Offer the server this phone last signed in to. Still editable — moving house or a new
    // router changes the address — but nobody should have to go and look up an IP to sign back in.
    var baseUrl by remember { mutableStateOf(vm.rememberedBaseUrl) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Surface(Modifier.fillMaxSize(), color = Ink.ground) {
        Column(
            Modifier.fillMaxSize().padding(28.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.ic_jarvis_logo),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(72.dp),
            )
            Spacer(Modifier.height(20.dp))
            Text("Jarvis", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = Ink.text)
            Spacer(Modifier.height(4.dp))
            Text(
                "Sign in to the server on your network.",
                fontSize = 14.sp,
                color = Ink.muted,
            )
            Spacer(Modifier.height(28.dp))

            LoginField(baseUrl, { baseUrl = it }, "Server", "http://192.168.1.5:8080")
            Spacer(Modifier.height(12.dp))
            LoginField(username, { username = it }, "Username", "darklord")
            Spacer(Modifier.height(12.dp))
            LoginField(password, { password = it }, "Password", "", password = true)

            vm.loginError?.let {
                Spacer(Modifier.height(14.dp))
                Text(it, color = Ink.out, fontSize = 13.sp)
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { vm.login(baseUrl, username, password) },
                enabled = !vm.loginBusy && baseUrl.length > 8 && username.isNotBlank() && password.isNotBlank(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Ink.accent,
                    contentColor = Color.White,
                    disabledContainerColor = Ink.well,
                    disabledContentColor = Ink.dim,
                ),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                Text(if (vm.loginBusy) "Signing in…" else "Sign in", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    placeholder: String,
    password: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = { if (placeholder.isNotEmpty()) Text(placeholder, color = Ink.faint) },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = if (password) KeyboardOptions(keyboardType = KeyboardType.Password) else KeyboardOptions.Default,
        colors = fieldColours(),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun fieldColours() = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
    focusedContainerColor = Ink.surface,
    unfocusedContainerColor = Ink.surface,
    focusedBorderColor = Ink.accentLift,
    unfocusedBorderColor = Ink.hairlineStrong,
    focusedLabelColor = Ink.accentSoft,
    unfocusedLabelColor = Ink.dim,
    cursorColor = Ink.accentLift,
    focusedTextColor = Ink.text,
    unfocusedTextColor = Ink.text,
)

/* ------------------------------------------------------------------ scaffold */

@Composable
private fun MainScaffold(
    vm: AppViewModel,
    session: SessionEntity,
    hasSmsPermission: Boolean,
    onRequestPermissions: () -> Unit,
) {
    val tabs = listOf(
        Tab("Dashboard", Icons.Filled.Dashboard),
        Tab("Money", Icons.Filled.ReceiptLong),
        Tab("Ask", Icons.Filled.AutoAwesome),
        Tab("Inbox", Icons.Filled.Sms),
        Tab("Settings", Icons.Filled.Settings),
    )
    var selected by remember { mutableIntStateOf(0) }
    var alertsOpen by remember { mutableStateOf(false) }
    var historyOpen by remember { mutableStateOf(false) }
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
        containerColor = Ink.ground,
        floatingActionButton = {
            if (!alertsOpen && !historyOpen && selected == 0) {
                FloatingActionButton(
                    onClick = { addOpen = true },
                    containerColor = Ink.accent,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(18.dp),
                ) { Icon(Icons.Filled.Add, "Add transaction") }
            }
        },
        bottomBar = {
            Column {
                Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.hairline))
                JarvisNavBar(tabs, selected) { selected = it }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                alertsOpen -> AlertsScreen(vm) { alertsOpen = false }
                historyOpen -> HistoryScreen(vm) { historyOpen = false }
                selected == 0 -> DashboardScreen(vm) { alertsOpen = true; vm.loadAlerts() }
                selected == 1 -> MoneyScreen(vm)
                selected == 2 -> AskScreen(vm)
                selected == 3 -> InboxScreen(vm, hasSmsPermission, onRequestPermissions)
                else -> SettingsScreen(vm, session, hasSmsPermission, onRequestPermissions) { historyOpen = true }
            }
        }
    }
}

/* ------------------------------------------------------------------ dashboard */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardScreen(vm: AppViewModel, onOpenAlerts: () -> Unit) {
    val cache by vm.dashboard.collectAsState()
    LaunchedEffect(Unit) { vm.refreshDashboard() }

    PullToRefreshBox(
        isRefreshing = vm.refreshing,
        onRefresh = { vm.refreshDashboard() },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            ScreenHeader(
                title = "This month",
                subtitle = when {
                    vm.offline -> "Offline · showing the last sync"
                    vm.refreshing -> "Refreshing…"
                    cache != null -> "Updated " + relativeTime(cache!!.updatedAt)
                    else -> null
                },
            ) {
                HeaderButton(Icons.Filled.Notifications, "Alerts", badge = vm.unreadAlerts > 0, onClick = onOpenAlerts)
            }

            val c = cache
            if (c == null) {
                Box(Modifier.fillMaxWidth().height(200.dp), Alignment.Center) {
                    Text(
                        if (vm.refreshing) "Loading…" else "Pull down to load your dashboard.",
                        color = Ink.dim,
                        fontSize = 14.sp,
                    )
                }
                return@Column
            }
            val x = vm.extras(c)

            // The one number the screen is about, before anything competes with it.
            //
            // The cached figure is savings cash alone — that is what the repository sums — so what
            // it is worth in total has to be put together here: what is in the bank, plus what is
            // invested, less what is still owed. Showing the cash and calling it net worth left
            // ₹67 lakh of deposits out of the headline.
            val cash = c.netWorth
            val invested = x?.investmentValue ?: 0.0
            val owed = x?.loanOutstanding ?: 0.0
            Column(Modifier.padding(horizontal = 20.dp)) {
                SectionLabel("Net worth")
                Spacer(Modifier.height(7.dp))
                Money(money(cash + invested - owed), size = 36, weight = FontWeight.ExtraBold)
                if (invested > 0 || owed > 0) {
                    Spacer(Modifier.height(14.dp))
                    NetWorthParts(cash, invested, owed)
                }
            }

            Spacer(Modifier.height(22.dp))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StatTile(
                    "Spent · " + monthShort(), money(c.monthSpend),
                    Icons.Filled.TrendingDown, Ink.out, Modifier.weight(1f),
                )
                // Both of these are income-derived, so for a member with no income of their own they
                // would read as a flat 0 — a worse answer than not showing them at all.
                if (x?.earns != false) {
                    StatTile(
                        "Earned · " + monthShort(1), money(c.lastMonthEarning),
                        Icons.Filled.TrendingUp, Ink.in_, Modifier.weight(1f),
                    )
                } else {
                    Spacer(Modifier.weight(1f))
                }
            }

            if (x?.earns != false) {
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                    SavingsRateRow(c.savingsRate)
                }
            }

            Spacer(Modifier.height(22.dp))
            Box(Modifier.padding(horizontal = 20.dp)) {
                FinanceScoreSection(x?.score, vm.refreshing)
            }

            val cats = vm.topCategories(c)
            if (cats.isNotEmpty()) {
                Spacer(Modifier.height(22.dp))
                Column(Modifier.padding(horizontal = 20.dp)) {
                    SectionLabel("Top categories") {
                        Text(monthShort(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Ink.dim)
                    }
                    Spacer(Modifier.height(12.dp))
                    val biggest = cats.maxOf { it.total }.coerceAtLeast(1.0)
                    cats.forEachIndexed { i, cat ->
                        if (i > 0) Spacer(Modifier.height(13.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(cat.category, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                                color = Ink.text, modifier = Modifier.weight(1f))
                            Money(money(cat.total), size = 14)
                        }
                        Spacer(Modifier.height(6.dp))
                        Meter(
                            (cat.total / biggest).toFloat(),
                            color = if (i == 0) Ink.out else Ink.out.copy(alpha = 0.75f),
                        )
                    }
                }
            }

            x?.let { DashboardExtrasSections(it, vm) }

            Spacer(Modifier.height(96.dp)) // clear of the FAB and the tab bar
        }
    }
}

/**
 * What the headline is made of. Three figures rather than one is the difference between a number
 * to trust and a number to wonder about — and the loan is the part most easily forgotten.
 */
@Composable
private fun NetWorthParts(cash: Double, invested: Double, owed: Double) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        NetWorthPart("Cash", money(cash), Ink.text, Modifier.weight(1f))
        if (invested > 0) NetWorthPart("Invested", money(invested), Ink.in_, Modifier.weight(1f))
        if (owed > 0) NetWorthPart("Owed", "−" + money(owed), Ink.out, Modifier.weight(1f))
    }
}

@Composable
private fun NetWorthPart(label: String, value: String, colour: Color, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, fontSize = 11.sp, color = Ink.dim)
        Spacer(Modifier.height(3.dp))
        Money(value, size = 13, color = colour, weight = FontWeight.SemiBold)
    }
}

@Composable
private fun SavingsRateRow(rate: Int) {
    Panel(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Savings rate", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink.text)
                Spacer(Modifier.height(8.dp))
                Meter(rate / 100f, color = Ink.in_, height = 5)
            }
            Spacer(Modifier.width(14.dp))
            Money("$rate%", size = 20, color = Ink.in_)
        }
    }
}

/** Jarvis's AI finance score: the number, a rule, and what it says — no gauge on a gradient slab. */
@Composable
private fun FinanceScoreSection(score: FinanceScoreDto?, refreshing: Boolean) {
    val accent = when (score?.rating?.lowercase()) {
        "excellent", "good" -> Ink.in_
        "fair" -> Color(0xFFF5C542)
        null -> Ink.accentLift
        else -> Ink.out
    }
    Panel(Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("Finance score", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    color = Ink.text, modifier = Modifier.weight(1f))
                if (score != null) {
                    Money(score.score.toString(), size = 22, color = accent, weight = FontWeight.ExtraBold)
                    Spacer(Modifier.width(5.dp))
                    Text("/ 100", fontSize = 12.sp, color = Ink.dim)
                }
            }
            Spacer(Modifier.height(12.dp))
            if (score == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (refreshing) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.accentLift)
                        Spacer(Modifier.width(10.dp))
                        Text("Working out your score…", fontSize = 13.sp, color = Ink.muted)
                    } else {
                        Text(
                            "No score yet — pull down once the AI service is running.",
                            fontSize = 13.sp, color = Ink.muted,
                        )
                    }
                }
            } else {
                Meter(score.score / 100f, color = accent, height = 5)
                Spacer(Modifier.height(12.dp))
                Text(score.rating, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = accent)
                Spacer(Modifier.height(3.dp))
                Text(score.headline, fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp)
                if (score.tips.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    score.tips.take(3).forEach { tip ->
                        Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Filled.Lightbulb, null, tint = accent,
                                modifier = Modifier.padding(top = 2.dp).size(13.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(tip, fontSize = 12.5.sp, color = Ink.muted, lineHeight = 18.sp)
                        }
                    }
                }
            }
        }
    }
}

/** Upcoming payments, holdings, the loan, and the latest transactions — all from the cached extras. */
@Composable
private fun DashboardExtrasSections(x: DashboardExtras, vm: AppViewModel) {
    if (x.upcoming.isNotEmpty()) {
        Spacer(Modifier.height(22.dp))
        Column(Modifier.padding(horizontal = 20.dp)) {
            SectionLabel("Coming up") {
                Text("next 30 days", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Ink.dim)
            }
            Spacer(Modifier.height(12.dp))
            PanelGroup(Modifier.fillMaxWidth()) {
                x.upcoming.forEach { u ->
                    PanelRow {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val on = runCatching { LocalDate.parse(u.on) }.getOrNull()
                            if (on != null) {
                                DayStamp(
                                    on.dayOfMonth.toString().padStart(2, '0'),
                                    on.month.getDisplayName(TextStyle.SHORT, Locale.getDefault()),
                                )
                                Spacer(Modifier.width(12.dp))
                            }
                            Column(Modifier.weight(1f)) {
                                Text(u.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink.text, maxLines = 1)
                                Text(
                                    dueLabel(u.on) + (u.type?.let { " · " + it.lowercase().replaceFirstChar(Char::uppercase) } ?: ""),
                                    fontSize = 11.5.sp, color = Ink.dim, maxLines = 1,
                                )
                            }
                            if (u.amount != null) {
                                Money(money(u.amount), size = 14, color = Ink.out)
                            } else {
                                Text("amount not set", fontSize = 12.sp, color = Ink.dim)
                            }
                            // A bill paid on the way home should close from the phone, not the laptop.
                            if (u.reminderId != null) {
                                Spacer(Modifier.width(6.dp))
                                TextButton(
                                    onClick = { vm.markPaid(u.reminderId, u.on, u.amount) },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                ) {
                                    Text("Paid", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Ink.accentLift)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (x.accounts.isNotEmpty()) {
        Spacer(Modifier.height(22.dp))
        Column {
            Box(Modifier.padding(horizontal = 20.dp)) { SectionLabel("Accounts & cards") }
            Spacer(Modifier.height(12.dp))
            LazyRow(
                contentPadding = PaddingValues(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(x.accounts, key = { it.id }) { a -> AccountTile(a) }
            }
        }
    }

    if (x.invested > 0 || x.loanOutstanding > 0) {
        Spacer(Modifier.height(22.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (x.invested > 0) {
                val gain = x.investmentValue - x.invested
                Panel(Modifier.weight(1f)) {
                    Column {
                        Text("Investments", fontSize = 12.sp, color = Ink.muted)
                        Spacer(Modifier.height(7.dp))
                        Money(money(x.investmentValue), size = 19)
                        Spacer(Modifier.height(3.dp))
                        Money(
                            (if (gain >= 0) "+" else "−") + money(kotlin.math.abs(gain)),
                            size = 12,
                            color = if (gain >= 0) Ink.in_ else Ink.out,
                            weight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            if (x.loanOutstanding > 0) {
                Panel(Modifier.weight(1f)) {
                    Column {
                        Text("Loan left", fontSize = 12.sp, color = Ink.muted)
                        Spacer(Modifier.height(7.dp))
                        Money(money(x.loanOutstanding), size = 19)
                        Spacer(Modifier.height(3.dp))
                        Text(
                            "EMI " + money(x.loanEmi) + (x.loanEmisLeft?.let { " · $it left" } ?: ""),
                            fontSize = 12.sp, color = Ink.dim, maxLines = 1,
                        )
                    }
                }
            }
        }
    }

    if (x.recent.isNotEmpty()) {
        Spacer(Modifier.height(22.dp))
        Column(Modifier.padding(horizontal = 20.dp)) {
            SectionLabel("Recent")
            Spacer(Modifier.height(12.dp))
            x.recent.forEachIndexed { i, t ->
                if (i > 0) Spacer(Modifier.height(14.dp))
                val debit = t.direction == "DEBIT"
                val name = t.merchant?.takeIf { it.isNotBlank() } ?: t.category ?: "Transaction"
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Well {
                        Text(
                            name.first().uppercase(),
                            fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink.muted,
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink.text, maxLines = 1)
                        Text(
                            listOfNotNull(
                                t.category,
                                t.occurredAt.take(10),
                                if (t.transfer) "transfer" else if (t.settlement) "bill payment" else null,
                            ).joinToString(" · "),
                            fontSize = 11.5.sp, color = Ink.dim, maxLines = 1,
                        )
                    }
                    Money(
                        (if (debit) "−" else "+") + money(t.amount),
                        size = 14,
                        color = if (t.transfer || t.settlement) Ink.muted else Ink.text,
                    )
                }
            }
        }
    }
}

/** One account or card. A hairline surface with a single coloured edge, not a painted slab. */
@Composable
private fun AccountTile(a: AccountDto) {
    val savings = a.type == "SAVINGS"
    val edge = when {
        savings -> Ink.in_
        a.network.equals("AMEX", true) -> Ink.alt
        a.network.equals("VISA", true) -> Color(0xFFF5C542)
        a.network.equals("MASTERCARD", true) -> Color(0xFFF97316)
        else -> Ink.accentLift
    }
    // The name and the last four are two facts, not one string: joined, "Amazon Pay ICICI •••• 4008"
    // ran off the end of the tile and was cut. Split over two lines, each one fits.
    val name = a.displayName?.substringBefore(" ••••")?.trim()?.takeIf { it.isNotEmpty() }
        ?: a.bank?.takeIf { it.isNotBlank() }
        ?: if (savings) "Savings" else "Card"
    Panel(Modifier.width(210.dp)) {
        Column(Modifier.heightIn(min = 88.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        name,
                        fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink.text,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        listOfNotNull(
                            a.last4?.takeIf { it.isNotBlank() }?.let { "•••• $it" },
                            if (savings) "Savings" else a.network,
                        ).joinToString(" · "),
                        fontSize = 11.sp, color = Ink.dim, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.width(8.dp))
                Box(Modifier.width(24.dp).height(3.dp).clip(RoundedCornerShape(999.dp)).background(edge))
            }
            Spacer(Modifier.height(16.dp))
            Text(if (savings) "Balance" else "Limit", fontSize = 11.sp, color = Ink.dim)
            Spacer(Modifier.height(2.dp))
            Money(
                if (savings) a.balance?.let { money(it) } ?: "—"
                else a.creditLimit?.let { money(it) } ?: "—",
                size = 17,
            )
        }
    }
}

private fun dueLabel(isoDate: String): String {
    val d = runCatching { LocalDate.parse(isoDate) }.getOrNull() ?: return isoDate
    val days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), d)
    return when {
        days == 0L -> "Due today"
        days == 1L -> "Due tomorrow"
        else -> "In $days days"
    }
}

/* ------------------------------------------------------------------ quick add */

/** Quick-add: a cash / missed spend or receipt, posted to Jarvis as a manual transaction. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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
        containerColor = Ink.surface,
        titleContentColor = Ink.text,
        textContentColor = Ink.muted,
        shape = RoundedCornerShape(20.dp),
        title = { Text("Add transaction", fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("Spent", direction == "DEBIT") { direction = "DEBIT" }
                    Chip("Received", direction == "CREDIT") { direction = "CREDIT" }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Amount (₹)") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColours(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = merchant,
                    onValueChange = { merchant = it },
                    label = { Text("Paid to / note") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColours(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))
                SectionLabel("Category")
                Spacer(Modifier.height(8.dp))
                androidx.compose.foundation.layout.FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    categories.forEach { c -> Chip(c, category == c) { category = c } }
                }
                if (savings.size > 1) {
                    Spacer(Modifier.height(14.dp))
                    SectionLabel("From account")
                    Spacer(Modifier.height(8.dp))
                    androidx.compose.foundation.layout.FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        savings.forEach { a ->
                            Chip(a.displayName ?: ("•••• " + a.id), accountId == a.id) { accountId = a.id }
                        }
                    }
                }
                vm.addError?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, color = Ink.out, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = value != null && value > 0 && !vm.addBusy,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Ink.accent, contentColor = Color.White),
                onClick = { vm.addTransaction(value!!, direction, category, merchant, accountId, null, onDone = onDismiss) },
            ) { Text(if (vm.addBusy) "Saving…" else "Save", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !vm.addBusy) { Text("Cancel", color = Ink.muted) }
        },
    )
}

/* ------------------------------------------------------------------ alerts */

/** Server-side alerts (thresholds, payments due, expiries, sync summaries). */
@Composable
private fun AlertsScreen(vm: AppViewModel, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            title = "Alerts",
            subtitle = if (vm.unreadAlerts > 0) "${vm.unreadAlerts} unread" else "All read",
            onBack = onBack,
        ) {
            if (vm.unreadAlerts > 0) {
                TextButton(onClick = { vm.markAllAlertsRead() }) {
                    Text("Mark all read", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Ink.accentLift)
                }
            }
        }
        if (vm.alerts.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text(
                    "Nothing yet. Budget, EMI and card-expiry alerts land here.",
                    color = Ink.dim, fontSize = 14.sp,
                )
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(vm.alerts, key = { it.id }) { n ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        val dot = runCatching { Color(android.graphics.Color.parseColor(n.color ?: "#7C5CFF")) }
                            .getOrDefault(Ink.accent)
                        Box(
                            Modifier.padding(top = 6.dp).size(8.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (n.read) Ink.faint else dot),
                        )
                        Spacer(Modifier.width(13.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                n.title,
                                fontSize = 14.sp,
                                fontWeight = if (n.read) FontWeight.Medium else FontWeight.Bold,
                                color = Ink.text,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(n.message, fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp)
                            Spacer(Modifier.height(3.dp))
                            Text(n.createdAt.take(16).replace('T', ' '), fontSize = 11.sp, color = Ink.faint)
                        }
                    }
                    Rule(startInset = 20)
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ inbox */

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
        Column(Modifier.fillMaxSize()) {
            ScreenHeader("Bank SMS")
            Box(Modifier.padding(horizontal = 20.dp)) {
                Panel(Modifier.fillMaxWidth()) {
                    Column {
                        Text("SMS permission needed", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink.text)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Jarvis reads the bank alerts already on this phone and forwards new ones. Nothing else is read.",
                            fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp,
                        )
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = onRequestPermissions,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Ink.accent, contentColor = Color.White),
                        ) { Text("Grant permission", fontWeight = FontWeight.Bold) }
                    }
                }
            }
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

    PullToRefreshBox(
        isRefreshing = vm.inboxBusy && vm.inbox.isNotEmpty(),
        onRefresh = { vm.loadInbox() },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(Modifier.fillMaxSize()) {
            ScreenHeader(
                title = "Bank SMS",
                subtitle = when {
                    vm.inboxBusy -> "Reading the inbox…"
                    vm.inboxError != null -> vm.inboxError
                    visible.isEmpty() -> "No transaction SMS found"
                    unsynced == 0 -> "${visible.size} messages · all synced"
                    else -> "${visible.size} messages · $unsynced not synced"
                },
            ) {
                HeaderButton(Icons.Filled.Refresh, "Rescan") { if (!vm.inboxBusy) vm.loadInbox() }
                if (unsynced > 0) {
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { vm.syncInbox(visible) },
                        enabled = !vm.inboxBusy,
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Ink.accent, contentColor = Color.White),
                        modifier = Modifier.height(38.dp),
                    ) { Text("Sync $unsynced", fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                }
            }

            if (months.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { Chip("All", selectedMonth == null) { selectedMonth = null } }
                    items(months) { m ->
                        val label = m.month.getDisplayName(TextStyle.SHORT, Locale.getDefault()) + " " + m.year
                        Chip(label, selectedMonth == m) { selectedMonth = m }
                    }
                }
                Spacer(Modifier.height(14.dp))
            }

            when {
                vm.inboxBusy && vm.inbox.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                    CircularProgressIndicator(color = Ink.accentLift)
                }
                visible.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                    Text("No bank SMS in this period.", color = Ink.dim, fontSize = 14.sp)
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
    Column(
        Modifier.fillMaxWidth().clickable { expanded = !expanded }
            .padding(horizontal = 20.dp, vertical = 13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                sms.sender ?: "SMS",
                fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Ink.muted,
                letterSpacing = 0.04.sp * 12, modifier = Modifier.weight(1f),
            )
            Text(relativeTime(sms.receivedAt), fontSize = 11.sp, color = Ink.dim)
        }
        Spacer(Modifier.height(7.dp))
        Text(
            sms.body,
            fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp,
            maxLines = if (expanded) Int.MAX_VALUE else 3,
        )
        Spacer(Modifier.height(9.dp))
        // What Jarvis made of it. This line is the reason the screen exists, so it is a surface of
        // its own rather than another grey sentence under the message.
        Verdict(status, amount, direction, if (expanded) detail else null)
    }
    Rule(startInset = 20)
}

/** The parsed reading of one message, or an honest note that it has not been read yet. */
@Composable
private fun Verdict(status: String, amount: String?, direction: String?, detail: String?) {
    val done = status == "PARSED" || status == "INVESTMENT"
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(Ink.surface)
            .border(1.dp, Ink.hairline, RoundedCornerShape(11.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusDot(status)
        Spacer(Modifier.width(9.dp))
        if (detail != null) {
            Text(detail, fontSize = 12.5.sp, color = Ink.text, lineHeight = 18.sp)
        } else if (amount != null) {
            Money(
                (if (direction == "CREDIT") "+" else if (direction == "DEBIT") "−" else "") + amount,
                size = 12,
                color = if (done) Ink.text else Ink.muted,
            )
            Spacer(Modifier.width(8.dp))
            Text(statusWord(status), fontSize = 12.5.sp, color = Ink.dim)
        } else {
            Text(statusWord(status), fontSize = 12.5.sp, color = Ink.dim)
        }
    }
}

private fun statusWord(status: String) = when (status) {
    "PARSED" -> "recorded"
    "INVESTMENT" -> "added to an investment"
    "DUPLICATE" -> "already recorded"
    "IGNORED" -> "not a transaction"
    "QUEUED" -> "queued to send"
    "SENT" -> "waiting to be read by Jarvis"
    "NEW" -> "not sent yet"
    else -> "could not be read"
}

@Composable
private fun StatusDot(status: String) {
    val colour = when (status) {
        "PARSED", "INVESTMENT" -> Ink.in_
        "DUPLICATE", "IGNORED" -> Ink.dim
        "QUEUED", "SENT", "NEW" -> Ink.accentLift
        else -> Ink.out
    }
    Box(Modifier.size(8.dp).clip(RoundedCornerShape(999.dp)).background(colour))
}

/* ------------------------------------------------------------------ history */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryScreen(vm: AppViewModel, onBack: () -> Unit) {
    val pending by vm.pendingCount.collectAsState()
    val log by vm.log.collectAsState()

    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(refreshing) { if (refreshing) { vm.syncNow(); kotlinx.coroutines.delay(1200); refreshing = false } }
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ScreenHeader(
                title = "Sync history",
                subtitle = if (pending > 0) "$pending queued, waiting to send" else "All caught up",
                onBack = onBack,
            ) {
                HeaderButton(Icons.Filled.Refresh, "Sync now") { vm.syncNow() }
            }
            if (log.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) {
                    Text("Forwarded messages appear here.", color = Ink.dim, fontSize = 14.sp)
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
    Column(
        Modifier.fillMaxWidth().clickable { expanded = !expanded }
            .padding(horizontal = 20.dp, vertical = 13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                entry.sender ?: "SMS",
                fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Ink.muted,
                letterSpacing = 0.04.sp * 12, modifier = Modifier.weight(1f),
            )
            Text(relativeTime(entry.at), fontSize = 11.sp, color = Ink.dim)
        }
        Spacer(Modifier.height(7.dp))
        Text(
            entry.snippet,
            fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp,
            maxLines = if (expanded) Int.MAX_VALUE else 2,
        )
        Spacer(Modifier.height(9.dp))
        Verdict(entry.status, null, null, if (expanded) entry.detail?.takeIf { it.isNotBlank() } else null)
    }
    Rule(startInset = 20)
}

/* ------------------------------------------------------------------ settings */

@Composable
private fun SettingsScreen(
    vm: AppViewModel,
    session: SessionEntity,
    hasSmsPermission: Boolean,
    onRequestPermissions: () -> Unit,
    onOpenHistory: () -> Unit,
) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScreenHeader("Settings")

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(999.dp)).background(Ink.accentWell)
                    .border(1.dp, Ink.accentLift.copy(alpha = 0.35f), RoundedCornerShape(999.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    session.username.take(1).uppercase(),
                    fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Ink.accentSoft,
                )
            }
            Spacer(Modifier.width(13.dp))
            Column(Modifier.weight(1f)) {
                Text(session.username, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Ink.text)
                // Say plainly whose money this sign-in shows, so nobody has to guess whether a
                // number on screen is theirs or the whole household's.
                val scope = if (session.admin) {
                    "Administrator · sees the whole household"
                } else {
                    val name = vm.dashboard.value
                        ?.let { vm.extras(it) }
                        ?.members
                        ?.firstOrNull { it.id == session.memberId }
                        ?.name
                    if (name != null) "Sees $name only" else "Sees one person only"
                }
                Text(scope, fontSize = 12.5.sp, color = Ink.dim)
            }
        }

        Spacer(Modifier.height(22.dp))
        Column(Modifier.padding(horizontal = 20.dp)) {
            SectionLabel("Forwarding")
            Spacer(Modifier.height(11.dp))
            PanelGroup(Modifier.fillMaxWidth()) {
                PanelRow {
                    SettingRow("Forward SMS", "Send new bank alerts to Jarvis") {
                        Switch(
                            checked = session.forwardingEnabled,
                            onCheckedChange = { vm.setForwarding(it) },
                            colors = switchColours(),
                        )
                    }
                }
                // Only offered when the phone has something to unlock with; a switch that could
                // never be satisfied would just lock someone out of their own accounts.
                val canLock = remember(context) { canLockApp(context) }
                PanelRow {
                    SettingRow(
                        "Require unlock",
                        if (canLock) "Fingerprint, face or screen lock before the app opens"
                        else "Set up a fingerprint or screen lock on this phone first",
                    ) {
                        Switch(
                            checked = vm.lockEnabled && canLock,
                            enabled = canLock,
                            onCheckedChange = { vm.setAppLock(it) },
                            colors = switchColours(),
                        )
                    }
                }
                PanelRow(onClick = onOpenHistory) {
                    SettingRow("Sync history", "What each forwarded message became") {
                        Icon(Icons.Filled.KeyboardArrowRight, null, tint = Ink.dim, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }

        if (!hasSmsPermission) {
            Spacer(Modifier.height(22.dp))
            Box(Modifier.padding(horizontal = 20.dp)) {
                Panel(Modifier.fillMaxWidth()) {
                    Column {
                        Text("SMS permission needed", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink.out)
                        Spacer(Modifier.height(4.dp))
                        Text("Nothing can be forwarded until this is granted.", fontSize = 13.sp, color = Ink.muted)
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = onRequestPermissions,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Ink.accent, contentColor = Color.White),
                        ) { Text("Grant permission", fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        Column(Modifier.padding(horizontal = 20.dp)) {
            SectionLabel("Server")
            Spacer(Modifier.height(11.dp))
            Panel(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(8.dp).clip(RoundedCornerShape(999.dp))
                            .background(if (vm.offline) Ink.out else Ink.in_),
                    )
                    Spacer(Modifier.width(13.dp))
                    Column(Modifier.weight(1f)) {
                        Money(session.baseUrl.removePrefix("http://").removePrefix("https://"), size = 14, weight = FontWeight.SemiBold)
                        Text(
                            if (vm.offline) "Not reachable right now" else "Reachable on this network",
                            fontSize = 12.sp, color = Ink.dim,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(
                onClick = { vm.syncNow() },
                shape = RoundedCornerShape(14.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Ink.hairlineStrong),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Icon(Icons.Filled.Refresh, null, tint = Ink.text, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(9.dp))
                Text("Sync now", fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = Ink.text)
            }
            OutlinedButton(
                onClick = { vm.logout() },
                shape = RoundedCornerShape(14.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Ink.out.copy(alpha = 0.28f)),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text("Log out", fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = Ink.out)
            }
        }

        Spacer(Modifier.height(20.dp))
        Box(Modifier.fillMaxWidth(), Alignment.Center) {
            Text("Jarvis Sync 1.1.0", fontSize = 11.5.sp, color = Ink.faint)
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun SettingRow(title: String, subtitle: String, trailing: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = Ink.text)
            Spacer(Modifier.height(3.dp))
            Text(subtitle, fontSize = 12.sp, color = Ink.dim, lineHeight = 17.sp)
        }
        Spacer(Modifier.width(13.dp))
        trailing()
    }
}

@Composable
private fun switchColours() = SwitchDefaults.colors(
    checkedThumbColor = Color.White,
    checkedTrackColor = Ink.accent,
    checkedBorderColor = Ink.accent,
    uncheckedThumbColor = Ink.dim,
    uncheckedTrackColor = Ink.track,
    uncheckedBorderColor = Ink.track,
    disabledUncheckedThumbColor = Ink.faint,
    disabledUncheckedTrackColor = Ink.track,
    disabledUncheckedBorderColor = Ink.track,
)

private val timeFmt = DateTimeFormatter.ofPattern("d MMM, HH:mm")
private fun relativeTime(epochMillis: Long): String {
    val date = Date(epochMillis)
    return timeFmt.format(date.toInstant().atZone(java.time.ZoneId.systemDefault()))
}
