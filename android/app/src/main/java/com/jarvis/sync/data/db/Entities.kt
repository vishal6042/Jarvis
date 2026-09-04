package com.jarvis.sync.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The single logged-in session, stored in the DB so the app stays logged in across restarts and
 * works offline. Always row id = 1 (single-user app). The password is NOT here — it lives in
 * EncryptedSharedPreferences (see Credentials) and is used only for silent re-login on a 401.
 */
@Entity(tableName = "session")
data class SessionEntity(
    @PrimaryKey val id: Int = 1,
    val baseUrl: String,
    val username: String,
    val token: String,
    val tokenSavedAt: Long = System.currentTimeMillis(),
    val forwardingEnabled: Boolean = true,
)

/** A captured SMS awaiting delivery. Durable — survives app kill / reboot until it reaches the server. */
@Entity(tableName = "pending_message")
data class PendingMessage(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val payload: String,
    val sender: String?,
    val receivedAt: Long,
    val attempts: Int = 0,
    /** Inbox SMS _id when this came from the Inbox backfill (null for live-captured SMS). */
    val smsId: Long? = null,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

/** A delivered message and the server's verdict — drives the History screen. */
@Entity(tableName = "sync_log")
data class SyncLogEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val snippet: String,
    val sender: String?,
    val status: String, // PARSED | DUPLICATE | IGNORED | FAILED
    val detail: String?,
    val at: Long = System.currentTimeMillis(),
    val smsId: Long? = null,
)

/** Inbox SMS ids already handed to the queue from the Inbox tab, so the list can show them as sent. */
@Entity(tableName = "imported_sms")
data class ImportedSms(@PrimaryKey val smsId: Long)

/** Projection: the server verdict for an inbox SMS (joins the Inbox list to sync_log). */
data class SmsVerdict(val smsId: Long, val status: String, val detail: String? = null)

/** Last successfully fetched dashboard numbers, so the dashboard renders offline. Always row id = 1. */
@Entity(tableName = "dashboard_cache")
data class DashboardCache(
    @PrimaryKey val id: Int = 1,
    val netWorth: Double,
    val monthSpend: Double,
    val lastMonthEarning: Double,
    val savingsRate: Int,
    val topCategoriesJson: String, // serialized List<CategorySpendDto>
    val updatedAt: Long = System.currentTimeMillis(),
    val extrasJson: String? = null, // serialized DashboardExtras (upcoming, investments, loan, recent)
)
