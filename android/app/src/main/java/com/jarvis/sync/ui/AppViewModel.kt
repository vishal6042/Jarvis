package com.jarvis.sync.ui

import kotlinx.coroutines.isActive

import kotlinx.coroutines.delay

import kotlinx.coroutines.Job

import com.jarvis.sync.notify.AlertNotifier

import com.jarvis.sync.data.NotificationDto

import com.jarvis.sync.data.DashboardExtras

import com.jarvis.sync.data.CreateTransactionDto

import com.jarvis.sync.data.AccountDto

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.sync.data.ApiException
import com.jarvis.sync.data.CategorySpendDto
import com.jarvis.sync.data.SyncRepository
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.data.db.DashboardCache
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.work.SyncScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException

sealed interface SessionUi {
    data object Loading : SessionUi
    data object LoggedOut : SessionUi
    data class LoggedIn(val session: SessionEntity) : SessionUi
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = SyncRepository.get(app)

    val session = repo.sessionFlow()
        .map { if (it == null) SessionUi.LoggedOut else SessionUi.LoggedIn(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionUi.Loading)

    val dashboard = repo.dashboardFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val pendingCount = repo.pendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val log = repo.syncLog()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // ---- Inbox tab ----
    /** Transaction-looking SMS from the phone inbox, newest first (loaded on demand). */
    var inbox by mutableStateOf<List<InboxSms>>(emptyList())
        private set
    var inboxBusy by mutableStateOf(false)
        private set
    var inboxError by mutableStateOf<String?>(null)
        private set
    val importedSmsIds = repo.importedSmsIds().map { it.toHashSet() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), hashSetOf<Long>())
    val queuedSmsIds = repo.queuedSmsIds().map { it.toHashSet() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), hashSetOf<Long>())
    val smsVerdicts = repo.smsVerdicts().map { list -> list.associate { it.smsId to it.status } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap<Long, String>())
    private val smsVerdictDetails = repo.smsVerdicts().map { list -> list.associate { it.smsId to (it.detail ?: "") } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap<Long, String>())

    /** What the server said about an inbox SMS once delivered (e.g. "Contribution to Post Office RD …"). */
    fun verdictDetail(smsId: Long): String? = smsVerdictDetails.value[smsId]?.ifBlank { null }

    fun loadInbox() {
        viewModelScope.launch {
            inboxBusy = true
            inboxError = null
            try {
                inbox = repo.scanInbox()
            } catch (e: SecurityException) {
                inboxError = "SMS permission is needed to read the inbox."
            } catch (e: Exception) {
                inboxError = e.message ?: "Couldn't read the inbox."
            } finally {
                inboxBusy = false
            }
        }
    }

    /** Queue the given inbox messages (those not already sent) and kick the sync worker. */
    fun syncInbox(messages: List<InboxSms>) {
        val done = importedSmsIds.value
        val fresh = messages.filter { it.id !in done }
        if (fresh.isEmpty()) return
        viewModelScope.launch {
            inboxBusy = true
            try {
                repo.syncInbox(fresh)
                SyncScheduler.syncNow(getApplication())
            } catch (e: Exception) {
                inboxError = e.message ?: "Sync failed."
            } finally {
                inboxBusy = false
            }
        }
    }

    var loginBusy by mutableStateOf(false)
        private set
    var loginError by mutableStateOf<String?>(null)
        private set
    var refreshing by mutableStateOf(false)
        private set
    var offline by mutableStateOf(false)
        private set

    fun login(baseUrl: String, username: String, password: String) {
        viewModelScope.launch {
            loginBusy = true
            loginError = null
            try {
                repo.login(baseUrl, username, password)
                refreshDashboard()
            } catch (e: Exception) {
                loginError = friendly(e)
            } finally {
                loginBusy = false
            }
        }
    }

    fun logout() = viewModelScope.launch { repo.logout() }

    fun setForwarding(enabled: Boolean) = viewModelScope.launch { repo.setForwarding(enabled) }

    fun syncNow() {
        SyncScheduler.syncNow(getApplication())
        refreshDashboard()
    }

    fun refreshDashboard() {
        viewModelScope.launch {
            refreshing = true
            try {
                repo.refreshDashboard()
                offline = false
            } catch (e: Exception) {
                offline = true
            } finally {
                refreshing = false
            }
        }
    }

    fun extras(cache: DashboardCache): DashboardExtras? = repo.parseExtras(cache)

    // ---- alerts ----
    var alerts by mutableStateOf<List<NotificationDto>>(emptyList())
        private set
    val unreadAlerts: Int get() = alerts.count { !it.read }
    private var alertStream: Job? = null

    fun loadAlerts() {
        viewModelScope.launch { runCatching { alerts = repo.notifications() } }
    }

    /** Keep the SSE stream open while the app is alive; reconnect after a drop. */
    fun startAlertStream() {
        if (alertStream?.isActive == true) return
        alertStream = viewModelScope.launch {
            while (isActive) {
                repo.streamNotifications { n ->
                    alerts = listOf(n) + alerts.filter { it.id != n.id }
                    AlertNotifier.notifyNew(getApplication(), listOf(n))
                }
                delay(15_000)
            }
        }
    }

    fun markAllAlertsRead() {
        alerts = alerts.map { it.copy(read = true) }
        viewModelScope.launch { runCatching { repo.markAllNotificationsRead() } }
    }

    // ---- quick-add expense ----
    var accounts by mutableStateOf<List<AccountDto>>(emptyList())
        private set
    var addBusy by mutableStateOf(false)
        private set
    var addError by mutableStateOf<String?>(null)
        private set

    fun loadAccounts() {
        viewModelScope.launch { runCatching { accounts = repo.accounts() } }
    }

    fun addTransaction(
        amount: Double, direction: String, category: String, merchant: String?, accountId: Long?, note: String?,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            addBusy = true
            addError = null
            try {
                repo.createManualTransaction(
                    CreateTransactionDto(
                        accountId = accountId, amount = amount, direction = direction,
                        merchant = merchant?.ifBlank { null }, category = category, note = note?.ifBlank { null },
                    )
                )
                onDone()
                refreshDashboard()
            } catch (e: Exception) {
                addError = friendly(e)
            } finally {
                addBusy = false
            }
        }
    }

    fun topCategories(cache: DashboardCache): List<CategorySpendDto> = repo.parseTopCategories(cache)

    private fun friendly(e: Exception): String = when {
        e is ApiException.Http && e.code == 401 -> "Invalid username or password."
        e is ApiException.Unauthorized -> "Invalid username or password."
        e is ApiException.Http -> "Server error (HTTP ${e.code})."
        e is IOException -> "Can't reach the server. Check the URL and that the phone is on the same network."
        else -> e.message ?: "Login failed."
    }
}
