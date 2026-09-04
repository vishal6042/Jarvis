package com.jarvis.sync.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.sync.data.ApiException
import com.jarvis.sync.data.CategorySpendDto
import com.jarvis.sync.data.SyncRepository
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

    fun topCategories(cache: DashboardCache): List<CategorySpendDto> = repo.parseTopCategories(cache)

    private fun friendly(e: Exception): String = when {
        e is ApiException.Http && e.code == 401 -> "Invalid username or password."
        e is ApiException.Unauthorized -> "Invalid username or password."
        e is ApiException.Http -> "Server error (HTTP ${e.code})."
        e is IOException -> "Can't reach the server. Check the URL and that the phone is on the same network."
        else -> e.message ?: "Login failed."
    }
}
