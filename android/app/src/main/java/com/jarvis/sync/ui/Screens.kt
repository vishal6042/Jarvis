package com.jarvis.sync.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.sync.BuildConfig
import com.jarvis.sync.data.DeviceInfo
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.data.db.SyncLogEntry
import com.jarvis.sync.finance.rupees
import com.jarvis.sync.ui.theme.Ink
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Root: sign-in or the app, from the persisted session (works offline). */
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

/** The dark ground with a violet glow at the top, shared by sign-in and the lock screen. */
internal val GlowGround = Brush.radialGradient(
    colors = listOf(Ink.accentWell, Ink.ground),
    center = androidx.compose.ui.geometry.Offset(540f, 0f),
    radius = 1300f,
)

/** The app's mark: a violet tile with a J. */
@Composable
internal fun JTile() {
    Box(Modifier.size(72.dp).clip(RoundedCornerShape(22.dp)).background(Ink.accent), contentAlignment = Alignment.Center) {
        Text("J", fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
    }
}

// ---------------------------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------------------------

@Composable
private fun LoginScreen(vm: AppViewModel) {
    var baseUrl by remember { mutableStateOf(vm.rememberedBaseUrl) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    LaunchedEffect(baseUrl) { vm.checkServer(baseUrl) }

    Column(
        Modifier.fillMaxSize().background(GlowGround).statusBarsPadding().navigationBarsPadding()
            .verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 48.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(Modifier.fillMaxWidth(), Alignment.Center) { JTile() }
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Jarvis", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
            Text("Your money, read and understood on your own PC", fontSize = 14.sp, color = Ink.muted, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            LoginField("Home PC address", baseUrl, { baseUrl = it }, "http://192.168.0.47:8080", KeyboardType.Uri)
            when (vm.serverFound) {
                true -> Text("● found on this Wi-Fi", fontSize = 12.sp, color = Ink.in_)
                false -> Text("● no Jarvis answering at this address", fontSize = 12.sp, color = Ink.out)
                null -> if (baseUrl.length >= 12) Text("checking…", fontSize = 12.sp, color = Ink.dim)
            }
        }
        LoginField("Username", username, { username = it }, "darklord")
        LoginField("Password", password, { password = it }, "", KeyboardType.Password, secret = true)
        vm.loginError?.let { Text(it, color = Ink.out, fontSize = 13.sp) }
        Spacer(Modifier.height(12.dp))
        JButton(
            if (vm.loginBusy) "Signing in…" else "Sign in", Modifier.fillMaxWidth(), height = 52.dp, fontSize = 16,
            enabled = baseUrl.length > 8 && username.isNotBlank() && password.isNotBlank(), busy = vm.loginBusy,
        ) { vm.login(baseUrl, username, password) }
    }
}

@Composable
private fun LoginField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    keyboard: KeyboardType = KeyboardType.Text,
    secret: Boolean = false,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, fontSize = 12.sp, color = Ink.muted)
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).background(Ink.surface)
                .border(1.dp, Ink.hairlineStrong, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, fontSize = 15.sp, color = Ink.faint)
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true,
                textStyle = TextStyle(color = Ink.text, fontSize = 15.sp),
                cursorBrush = SolidColor(Ink.accentLift),
                keyboardOptions = KeyboardOptions(keyboardType = keyboard),
                visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The scaffold
// ---------------------------------------------------------------------------------------------

private data class Tab(val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("Home", Icons.Filled.Home),
    Tab("Money", Icons.AutoMirrored.Filled.ReceiptLong),
    Tab("Ask", Icons.Filled.AutoAwesome),
    Tab("Wealth", Icons.Filled.BarChart),
    Tab("Inbox", Icons.Filled.Inbox),
)

private enum class Overlay { SETTINGS, ALERTS, HISTORY }

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun MainScaffold(vm: AppViewModel, session: SessionEntity, hasSmsPermission: Boolean, onRequestPermissions: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    var overlay by remember { mutableStateOf<Overlay?>(null) }
    var statement by remember { mutableStateOf<Long?>(null) }
    var review by remember { mutableStateOf(false) }
    var add by remember { mutableStateOf<AddPrefill?>(null) }
    LaunchedEffect(Unit) {
        vm.loadAlerts()
        vm.startAlertStream()
        vm.loadAccounts()
    }
    LaunchedEffect(hasSmsPermission) { if (hasSmsPermission && vm.inbox.isEmpty()) vm.loadInbox() }
    val verdicts by vm.verdicts.collectAsState()
    val failed = remember(vm.inbox, verdicts) { failedSmsCount(vm) }

    BackHandler(enabled = overlay != null) {
        overlay = if (overlay == Overlay.HISTORY) Overlay.SETTINGS else null
    }
    BackHandler(enabled = overlay == null && tab != 0) { tab = 0 }

    val nav = HomeNav(
        settings = { overlay = Overlay.SETTINGS },
        alerts = { overlay = Overlay.ALERTS; vm.loadAlerts() },
        statement = { statement = it },
        review = { tab = 1; review = true },
        category = { c -> vm.clearAiFilter(); vm.query = ""; vm.month = java.time.YearMonth.now(); vm.categoryFilter = c; tab = 1 },
        inbox = { tab = 4 },
        wealth = { tab = 3 },
    )

    Scaffold(
        containerColor = Ink.ground,
        floatingActionButton = {
            if (overlay == null && tab == 0) {
                FloatingActionButton(
                    onClick = { add = AddPrefill() },
                    containerColor = Ink.accent, contentColor = Color.White, shape = RoundedCornerShape(18.dp),
                ) { Icon(Icons.Filled.Add, "Add a transaction") }
            }
        },
        bottomBar = {
            // Gone while typing, or the Ask box would float a tab bar's height above the keyboard.
            if (overlay == null && !WindowInsets.isImeVisible) NavBar(tab) { tab = it }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (overlay) {
                Overlay.SETTINGS -> SettingsScreen(vm, session, hasSmsPermission, onRequestPermissions, onBack = { overlay = null },
                    openHistory = { overlay = Overlay.HISTORY }, openAlerts = { overlay = Overlay.ALERTS; vm.loadAlerts() })
                Overlay.ALERTS -> AlertsScreen(vm) { overlay = null }
                Overlay.HISTORY -> HistoryScreen(vm) { overlay = Overlay.SETTINGS }
                null -> when (tab) {
                    0 -> HomeScreen(vm, session, failed, nav)
                    1 -> MoneyScreen(vm, openStatement = { statement = it }, openReview = { review = true })
                    2 -> AskScreen(vm, onEditReceipt = { add = AddPrefill.of(it) })
                    3 -> WealthScreen(vm)
                    else -> InboxScreen(vm, hasSmsPermission, onRequestPermissions, onAddByHand = { a -> add = AddPrefill(amount = a) })
                }
            }
        }
    }

    statement?.let { id -> StatementSheet(vm, id) { statement = null } }
    if (review) ReviewSheet(vm) { review = false }
    add?.let { p -> AddSheet(vm, p) { add = null } }
}

/** The tab bar: 72dp of chrome, the selected tab the only violet on it. */
@Composable
private fun NavBar(selected: Int, onSelect: (Int) -> Unit) {
    Column(Modifier.background(Ink.chrome).navigationBarsPadding()) {
        Hairline()
        Row(Modifier.fillMaxWidth().height(72.dp), verticalAlignment = Alignment.CenterVertically) {
            TABS.forEachIndexed { i, t ->
                val on = i == selected
                Column(
                    Modifier.weight(1f).fillMaxSize().clickable(role = Role.Tab) { onSelect(i) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(t.icon, null, tint = if (on) Ink.accentLift else Ink.dim, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(3.dp))
                    Text(t.label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = if (on) Ink.accentLift else Ink.dim)
                }
            }
        }
    }
}

/** A screen reached from another, with its own back arrow. */
@Composable
private fun BackHeader(title: String, subtitle: String? = null, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        IconSquare(Icons.AutoMirrored.Filled.ArrowBack, "Back", onClick = onBack)
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            subtitle?.let { Text(it, fontSize = 12.sp, color = Ink.muted) }
        }
        actions()
    }
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

@Composable
private fun SettingsScreen(
    vm: AppViewModel,
    session: SessionEntity,
    hasSmsPermission: Boolean,
    onRequestPermissions: () -> Unit,
    onBack: () -> Unit,
    openHistory: () -> Unit,
    openAlerts: () -> Unit,
) {
    val context = LocalContext.current
    val m by vm.model.collectAsState()
    var editReserve by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        BackHeader("Settings", onBack = onBack)
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Card(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(99.dp)).background(Ink.accentWell), contentAlignment = Alignment.Center) {
                        Text(session.username.take(1).uppercase(), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(session.username, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                        val scope = if (session.admin) "Household administrator · sees everyone" else {
                            val name = m?.x?.members?.firstOrNull { it.id == session.memberId }?.name
                            if (name != null) "Sees $name's money only" else "Sees one person's money only"
                        }
                        Text(scope, fontSize = 12.sp, color = Ink.muted)
                    }
                }
            }

            SectionLabel("This phone")
            SettingsGroup {
                val sent = remember { DeviceInfo.forwardedTotal(context) }
                val last = remember { DeviceInfo.lastSyncAt(context) }
                SettingRow("Forward bank SMS", "$sent sent" + if (last > 0) " · last sync " + ago(last) else "") {
                    Switch(session.forwardingEnabled, { vm.setForwarding(it) }, colors = switchColours())
                }
                val canLock = remember(context) { canLockApp(context) }
                SettingRow("Require unlock", if (canLock) "fingerprint or PIN after 30 s away" else "set up a fingerprint or screen lock first") {
                    Switch(vm.lockEnabled && canLock, { vm.setAppLock(it) }, enabled = canLock, colors = switchColours())
                }
                SettingRow("Morning brief", "a notification at 8 am with today's money") {
                    Switch(vm.morningBrief, { vm.switchMorningBrief(it) }, colors = switchColours())
                }
                SettingRow("Reserve", rupees(vm.reserve) + " kept aside in the forecast", onClick = { editReserve = true }) {
                    Text("›", fontSize = 18.sp, color = Ink.dim)
                }
                SettingRow("Sync history", "every SMS this phone sent, and what came of it", onClick = openHistory) {
                    Text("›", fontSize = 18.sp, color = Ink.dim)
                }
            }

            if (!hasSmsPermission) {
                Card(Modifier.fillMaxWidth(), border = Ink.out.copy(alpha = 0.3f)) {
                    Text("SMS permission needed", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink.out)
                    Text("Nothing can be forwarded until this is granted.", fontSize = 13.sp, color = Ink.muted)
                    JButton("Grant permission", onClick = onRequestPermissions)
                }
            }

            SectionLabel("Alerts")
            SettingsGroup {
                val top = vm.alerts.take(2)
                if (top.isEmpty()) Text("Nothing yet.", fontSize = 13.sp, color = Ink.dim, modifier = Modifier.padding(14.dp))
                top.forEach { n ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.padding(top = 6.dp).size(8.dp).clip(RoundedCornerShape(99.dp)).background(alertColour(n.color, n.read)))
                        Column(Modifier.weight(1f)) {
                            Text(n.title, fontSize = 14.sp, fontWeight = if (n.read) FontWeight.Bold else FontWeight.ExtraBold)
                            Text(n.message, fontSize = 12.sp, color = Ink.muted, maxLines = 2)
                        }
                    }
                    Hairline()
                }
                Text(
                    "All alerts ›", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = Ink.accentSoft,
                    modifier = Modifier.fillMaxWidth().clickable(onClick = openAlerts).padding(14.dp),
                )
            }

            SectionLabel("Server")
            Card(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(10.dp).clip(RoundedCornerShape(99.dp)).background(if (vm.offline) Ink.out else Ink.in_))
                    Column(Modifier.weight(1f)) {
                        Text(if (vm.offline) "Home PC · not reachable" else "Home PC · reachable", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text(session.baseUrl, fontSize = 12.sp, color = Ink.muted)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                JButton("Sync now", Modifier.weight(1f), ButtonStyle.OUTLINE, busy = vm.refreshing) { vm.syncNow() }
                JButton("Log out", Modifier.weight(1f), ButtonStyle.DANGER) { vm.logout() }
            }
            Text("Jarvis Sync " + BuildConfig.VERSION_NAME, fontSize = 12.sp, color = Ink.dim, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }

    if (editReserve) ReserveDialog(vm.reserve, { editReserve = false }) { vm.setReserve(it); editReserve = false }
}

@Composable
private fun ReserveDialog(current: Double, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var text by remember { mutableStateOf(current.toLong().toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Ink.surface,
        title = { Text("Reserve", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("The cushion the forecast keeps below. Safe to spend and the runway warning measure against it.", fontSize = 13.sp, color = Ink.muted)
                Box(
                    Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(12.dp)).background(Ink.raised).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    BasicTextField(
                        value = text, onValueChange = { text = it.filter(Char::isDigit) }, singleLine = true,
                        textStyle = TextStyle(color = Ink.text, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold),
                        cursorBrush = SolidColor(Ink.accentLift), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = { text.toDoubleOrNull()?.let(onSave) }) { Text("Save", color = Ink.accentSoft, fontWeight = FontWeight.ExtraBold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = Ink.muted) } },
    )
}

@Composable
private fun SettingsGroup(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ink.surface).border(1.dp, Ink.hairline, RoundedCornerShape(16.dp)),
    ) { content() }
}

@Composable
private fun SettingRow(title: String, subtitle: String, onClick: (() -> Unit)? = null, trailing: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, fontSize = 12.sp, color = Ink.muted)
        }
        trailing()
    }
    Hairline()
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

private fun alertColour(hex: String?, read: Boolean): Color =
    if (read) Ink.faint else runCatching { Color(android.graphics.Color.parseColor(hex ?: "#7C5CFF")) }.getOrDefault(Ink.accent)

private fun ago(epochMillis: Long): String {
    val mins = (System.currentTimeMillis() - epochMillis) / 60_000
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "$mins min ago"
        mins < 48 * 60 -> "${mins / 60} h ago"
        else -> "${mins / (24 * 60)} days ago"
    }
}

// ---------------------------------------------------------------------------------------------
// Alerts and sync history
// ---------------------------------------------------------------------------------------------

@Composable
private fun AlertsScreen(vm: AppViewModel, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        BackHeader("Alerts", if (vm.unreadAlerts > 0) "${vm.unreadAlerts} unread" else "All read", onBack) {
            if (vm.unreadAlerts > 0) TextButton(onClick = { vm.markAllAlertsRead() }) {
                Text("Mark all read", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Ink.accentSoft)
            }
        }
        if (vm.alerts.isEmpty()) {
            Quiet("Nothing yet. Budget, bill and card alerts land here.", Modifier.padding(horizontal = 16.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(vm.alerts, key = { it.id }) { n ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.padding(top = 6.dp).size(8.dp).clip(RoundedCornerShape(99.dp)).background(alertColour(n.color, n.read)))
                        Column(Modifier.weight(1f)) {
                            Text(n.title, fontSize = 14.sp, fontWeight = if (n.read) FontWeight.Medium else FontWeight.ExtraBold)
                            Text(n.message, fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp)
                            Text(n.createdAt.take(16).replace('T', ' '), fontSize = 11.sp, color = Ink.faint)
                        }
                    }
                    Rule(startInset = 16)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryScreen(vm: AppViewModel, onBack: () -> Unit) {
    val pending by vm.pendingCount.collectAsState()
    val log by vm.log.collectAsState()
    PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = { vm.syncNow() }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BackHeader("Sync history", if (pending > 0) "$pending queued, waiting to send" else "All caught up", onBack) {
                IconSquare(Icons.Filled.Refresh, "Sync now") { vm.syncNow() }
            }
            if (log.isEmpty()) {
                Quiet("Forwarded messages appear here.", Modifier.padding(horizontal = 16.dp))
            } else {
                LazyColumn(Modifier.fillMaxSize()) { items(log, key = { it.id }) { LogRow(it) } }
            }
        }
    }
}

private val LOG_TIME = DateTimeFormatter.ofPattern("d MMM, HH:mm")

@Composable
private fun LogRow(entry: SyncLogEntry) {
    var expanded by remember(entry.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(horizontal = 16.dp, vertical = 13.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text((entry.sender ?: "SMS").uppercase(), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Ink.muted, modifier = Modifier.weight(1f))
            Text(Instant.ofEpochMilli(entry.at).atZone(ZoneId.systemDefault()).format(LOG_TIME), fontSize = 11.sp, color = Ink.dim)
        }
        Spacer(Modifier.height(6.dp))
        Text(entry.snippet, fontSize = 13.sp, color = Ink.muted, lineHeight = 19.sp, maxLines = if (expanded) Int.MAX_VALUE else 2)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val c = when (entry.status) {
                "PARSED" -> Ink.in_
                "INVESTMENT" -> Ink.accentLift
                "DUPLICATE", "IGNORED" -> Ink.dim
                else -> Ink.out
            }
            Box(Modifier.size(7.dp).clip(RoundedCornerShape(99.dp)).background(c))
            Text(
                when (entry.status) {
                    "PARSED" -> "Saved as a transaction"
                    "INVESTMENT" -> "Counted as a deposit"
                    "DUPLICATE" -> "Sent twice, kept once"
                    "IGNORED" -> "Not a payment"
                    else -> "Couldn't read it"
                } + if (expanded) entry.detail?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "" else "",
                fontSize = 12.5.sp, color = Ink.text,
            )
        }
    }
    Rule(startInset = 16)
}
