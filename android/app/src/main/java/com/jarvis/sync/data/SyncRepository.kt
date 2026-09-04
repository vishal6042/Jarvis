package com.jarvis.sync.data

import android.content.Context
import androidx.room.withTransaction
import com.jarvis.sync.data.db.AppDatabase
import com.jarvis.sync.data.db.ImportedSms
import com.jarvis.sync.data.db.SmsVerdict
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.sms.SmsInboxScanner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.jarvis.sync.data.db.DashboardCache
import com.jarvis.sync.data.db.PendingMessage
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.data.db.SyncLogEntry
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/**
 * The device's brain: owns the Room DB, the API client, and the credential store, and implements the
 * durable-delivery + offline-first behaviour. Shared as a process singleton by the SMS receiver, the
 * WorkManager job, and the UI.
 */
class SyncRepository private constructor(context: Context) {

    private val db = AppDatabase.get(context)
    private val api = ApiClient()
    private val credentials = Credentials(context)
    private val json = Json { ignoreUnknownKeys = true }

    private val sessionDao = db.sessionDao()
    private val pendingDao = db.pendingDao()
    private val logDao = db.syncLogDao()
    private val dashboardDao = db.dashboardDao()
    private val importedDao = db.importedSmsDao()
    private val appContext = context.applicationContext

    // ---- observable state for the UI ----
    fun sessionFlow(): Flow<SessionEntity?> = sessionDao.observe()
    fun pendingCount(): Flow<Int> = pendingDao.count()
    fun syncLog(): Flow<List<SyncLogEntry>> = logDao.recent()
    fun dashboardFlow(): Flow<DashboardCache?> = dashboardDao.observe()
    fun importedSmsIds(): Flow<List<Long>> = importedDao.observeIds()
    fun queuedSmsIds(): Flow<List<Long>> = pendingDao.queuedSmsIds()
    fun smsVerdicts(): Flow<List<SmsVerdict>> = logDao.verdicts()

    suspend fun session(): SessionEntity? = sessionDao.get()

    fun parseTopCategories(cache: DashboardCache): List<CategorySpendDto> =
        runCatching { json.decodeFromString<List<CategorySpendDto>>(cache.topCategoriesJson) }
            .getOrDefault(emptyList())

    // ---- auth ----
    suspend fun login(baseUrl: String, username: String, password: String) {
        val cleaned = baseUrl.trim().trimEnd('/')
        val resp = api.login(cleaned, username.trim(), password)
        credentials.savePassword(password)
        sessionDao.upsert(
            SessionEntity(
                baseUrl = cleaned,
                username = username.trim(),
                token = resp.token,
                tokenSavedAt = System.currentTimeMillis(),
                forwardingEnabled = true,
            )
        )
    }

    suspend fun logout() {
        sessionDao.clear()
        dashboardDao.clear()
        logDao.clear()
        credentials.clear()
        importedDao.clear()
        // Pending queue is intentionally cleared on logout too (no session to deliver under).
        pendingDao.all().forEach { pendingDao.delete(it.id) }
    }

    suspend fun setForwarding(enabled: Boolean) = sessionDao.setForwarding(enabled)

    /** Re-login with the stored password; returns the refreshed session, or null if it can't. */
    private suspend fun reAuth(session: SessionEntity): SessionEntity? {
        val pwd = credentials.password() ?: return null
        return runCatching {
            val resp = api.login(session.baseUrl, session.username, pwd)
            sessionDao.updateToken(resp.token, System.currentTimeMillis())
            session.copy(token = resp.token)
        }.getOrNull()
    }

    // ---- SMS queue ----
    suspend fun enqueue(payload: String, sender: String?, receivedAt: Long) {
        pendingDao.insert(PendingMessage(payload = payload, sender = sender, receivedAt = receivedAt))
    }

    // ---- Inbox tab (backfill of existing bank SMS) ----

    /** Read the whole SMS inbox (READ_SMS) and keep only transaction-looking messages, newest first. */
    suspend fun scanInbox(): List<InboxSms> = withContext(Dispatchers.IO) { SmsInboxScanner.scan(appContext) }

    /** Queue inbox messages for delivery (oldest first) and mark them imported. Returns how many were queued. */
    suspend fun syncInbox(messages: List<InboxSms>): Int = withContext(Dispatchers.IO) {
        if (messages.isEmpty()) return@withContext 0
        db.withTransaction {
            // Filter against the DB inside the transaction (not the UI's cached set) so two quick
            // taps, or a tap before the observed set has refreshed, can't queue a message twice.
            val done = messages.map { it.id }.chunked(500).flatMap { importedDao.existing(it) }.toHashSet()
            val fresh = messages.filter { it.id !in done }.sortedBy { it.receivedAt }
            for (m in fresh) {
                pendingDao.insert(
                    PendingMessage(payload = m.body, sender = m.sender, receivedAt = m.receivedAt, smsId = m.id)
                )
            }
            importedDao.insertAll(fresh.map { ImportedSms(it.id) })
            fresh.size
        }
    }

    /**
     * Push every queued message to the backend. Returns true only when the queue is fully drained;
     * false if any message was left queued for a transport/auth reason (the worker then retries).
     * A message is deleted from the queue on any 2xx (server received & classified it) or on a
     * non-retryable 4xx (bad payload — logged FAILED so it can't loop forever); it is kept on
     * network errors, 5xx, and unrecoverable 401s.
     */
    suspend fun flush(): Boolean {
        var session = sessionDao.get() ?: return true // not logged in → nothing to do
        val queue = pendingDao.all()
        var allDelivered = true

        for (msg in queue) {
            val req = IngestRequestDto(
                source = "SMS",
                payload = msg.payload,
                sender = msg.sender,
                receivedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(msg.receivedAt)),
            )
            try {
                val res = try {
                    api.ingest(session.baseUrl, session.token, req)
                } catch (e: ApiException.Unauthorized) {
                    val refreshed = reAuth(session)
                    if (refreshed == null) {
                        keep(msg, "auth")
                        allDelivered = false
                        continue
                    }
                    session = refreshed
                    api.ingest(session.baseUrl, session.token, req) // one retry; may throw again
                }
                logDelivered(msg, res.status, res.detail)
                pendingDao.delete(msg.id)
            } catch (e: ApiException.Unauthorized) {
                keep(msg, "auth"); allDelivered = false
            } catch (e: ApiException.Http) {
                if (e.code in 500..599) {
                    keep(msg, "server ${e.code}"); allDelivered = false
                } else {
                    logDelivered(msg, "FAILED", "HTTP ${e.code}"); pendingDao.delete(msg.id)
                }
            } catch (e: Exception) { // IOException etc. — transport failure, keep and retry later
                keep(msg, e.message ?: "network"); allDelivered = false
            }
        }
        logDao.trim()
        return allDelivered
    }

    private suspend fun keep(msg: PendingMessage, error: String) {
        pendingDao.update(msg.copy(attempts = msg.attempts + 1, lastError = error))
    }

    private suspend fun logDelivered(msg: PendingMessage, status: String, detail: String?) {
        logDao.insert(
            SyncLogEntry(
                snippet = msg.payload.take(140), sender = msg.sender, status = status, detail = detail, smsId = msg.smsId,
            )
        )
    }

    // ---- dashboard (offline-first) ----
    /** Fetch current-month numbers and write the cache. Throws if offline/unreachable (UI shows cache). */
    suspend fun refreshDashboard() = authed { session ->
        val iso = DateTimeFormatter.ISO_INSTANT
        val zone = ZoneId.systemDefault()
        val firstOfMonth = LocalDate.now(zone).withDayOfMonth(1)
        val thisMonthStart = firstOfMonth.atStartOfDay(zone).toInstant()
        val lastMonthStart = firstOfMonth.minusMonths(1).atStartOfDay(zone).toInstant()
        val now = Instant.now()

        val thisMonth = api.summary(session.baseUrl, session.token, iso.format(thisMonthStart), iso.format(now))
        val lastMonth = api.summary(session.baseUrl, session.token, iso.format(lastMonthStart), iso.format(thisMonthStart))
        val accounts = api.accounts(session.baseUrl, session.token)
        val cats = api.byCategory(session.baseUrl, session.token, iso.format(thisMonthStart), iso.format(now))

        val netWorth = accounts.filter { it.type == "SAVINGS" }.sumOf { it.balance ?: 0.0 }
        val savingsRate =
            if (lastMonth.earning > 0) ((lastMonth.earning - lastMonth.spend) / lastMonth.earning * 100).roundToInt() else 0
        val top = cats.sortedByDescending { it.total }.take(5)

        dashboardDao.upsert(
            DashboardCache(
                netWorth = netWorth,
                monthSpend = thisMonth.spend,
                lastMonthEarning = lastMonth.earning,
                savingsRate = savingsRate,
                topCategoriesJson = json.encodeToString(top),
            )
        )
    }

    /** Run [block] with the current session; on a 401 re-login once and retry. */
    private suspend fun <T> authed(block: suspend (SessionEntity) -> T): T {
        val session = sessionDao.get() ?: throw ApiException.Unauthorized
        return try {
            block(session)
        } catch (e: ApiException.Unauthorized) {
            val refreshed = reAuth(session) ?: throw e
            block(refreshed)
        }
    }

    companion object {
        @Volatile
        private var instance: SyncRepository? = null

        fun get(context: Context): SyncRepository =
            instance ?: synchronized(this) {
                instance ?: SyncRepository(context.applicationContext).also { instance = it }
            }
    }
}
