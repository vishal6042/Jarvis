package com.jarvis.sync.ui

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
        Tab("History", Icons.Filled.History),
        Tab("Settings", Icons.Filled.Settings),
    )
    var selected by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = { TopAppBar(title = { Text(tabs[selected].label) }) },
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
            when (selected) {
                0 -> DashboardScreen(vm)
                1 -> HistoryScreen(vm)
                else -> SettingsScreen(vm, session, hasSmsPermission, onRequestPermissions)
            }
        }
    }
}

@Composable
private fun DashboardScreen(vm: AppViewModel) {
    val cache by vm.dashboard.collectAsState()
    LaunchedEffect(Unit) { vm.refreshDashboard() }

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
        if (c == null) {
            Box(Modifier.fillMaxWidth().height(160.dp), Alignment.Center) {
                Text(if (vm.refreshing) "Loading…" else "Pull the refresh button to load your dashboard.")
            }
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Net worth", money(c.netWorth), Modifier.weight(1f))
                StatCard("Spend · ${monthShort()}", money(c.monthSpend), Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Earning · ${monthShort(1)}", money(c.lastMonthEarning), Modifier.weight(1f))
                StatCard("Savings rate", "${c.savingsRate}%", Modifier.weight(1f))
            }

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
            Spacer(Modifier.height(8.dp))
            Text(
                "Updated ${relativeTime(c.updatedAt)}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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

@Composable
private fun HistoryScreen(vm: AppViewModel) {
    val pending by vm.pendingCount.collectAsState()
    val log by vm.log.collectAsState()

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

@Composable
private fun LogRow(entry: SyncLogEntry) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(entry.sender ?: "SMS", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            StatusChip(entry.status)
        }
        Spacer(Modifier.height(4.dp))
        Text(entry.snippet, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
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
