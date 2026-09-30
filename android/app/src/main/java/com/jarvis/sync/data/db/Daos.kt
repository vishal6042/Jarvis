package com.jarvis.sync.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {
    @Query("SELECT * FROM session WHERE id = 1")
    suspend fun get(): SessionEntity?

    @Query("SELECT * FROM session WHERE id = 1")
    fun observe(): Flow<SessionEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(session: SessionEntity)

    @Query("UPDATE session SET token = :token, tokenSavedAt = :savedAt WHERE id = 1")
    suspend fun updateToken(token: String, savedAt: Long)

    @Query("UPDATE session SET forwardingEnabled = :enabled WHERE id = 1")
    suspend fun setForwarding(enabled: Boolean)

    @Query("DELETE FROM session")
    suspend fun clear()
}

@Dao
interface PendingDao {
    @Insert
    suspend fun insert(msg: PendingMessage): Long

    @Query("SELECT * FROM pending_message ORDER BY receivedAt ASC")
    suspend fun all(): List<PendingMessage>

    @Query("SELECT COUNT(*) FROM pending_message")
    fun count(): Flow<Int>

    @Query("SELECT COUNT(*) FROM pending_message")
    suspend fun countNow(): Int

    @Query("SELECT smsId FROM pending_message WHERE smsId IS NOT NULL")
    fun queuedSmsIds(): Flow<List<Long>>

    /** Live-captured messages not yet matched to their inbox row. */
    @Query("SELECT * FROM pending_message WHERE smsId IS NULL")
    suspend fun unresolved(): List<PendingMessage>

    @Query("SELECT COUNT(*) FROM pending_message WHERE payload = :payload AND receivedAt BETWEEN :from AND :to")
    suspend fun countSimilar(payload: String, from: Long, to: Long): Int

    @Query("SELECT * FROM pending_message WHERE id = :id")
    suspend fun byId(id: Long): PendingMessage?

    @Update
    suspend fun update(msg: PendingMessage)

    @Query("DELETE FROM pending_message WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface SyncLogDao {
    @Insert
    suspend fun insert(entry: SyncLogEntry)

    @Query("SELECT * FROM sync_log ORDER BY at DESC LIMIT 200")
    fun recent(): Flow<List<SyncLogEntry>>

    /** Oldest first, so where a message was answered more than once the latest answer comes last. */
    @Query("SELECT smsId, status, detail, rawMessageId, transactionId FROM sync_log WHERE smsId IS NOT NULL ORDER BY at ASC, id ASC")
    fun verdicts(): Flow<List<SmsVerdict>>

    @Query("SELECT * FROM sync_log WHERE smsId = :smsId ORDER BY at ASC, id ASC")
    suspend fun forSms(smsId: Long): List<SyncLogEntry>

    @Query("UPDATE sync_log SET status = :status, detail = :detail, transactionId = :transactionId, at = :at WHERE rawMessageId = :rawMessageId")
    suspend fun settle(rawMessageId: Long, status: String, detail: String?, transactionId: Long?, at: Long)

    // Keep the log bounded — delete everything older than the newest 1,000 rows. It was 200, which
    // is less than one busy month of bank SMS, so the Inbox forgot what became of older messages.
    @Query("DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY at DESC LIMIT 1000)")
    suspend fun trim()

    @Query("DELETE FROM sync_log")
    suspend fun clear()
}

@Dao
interface ImportedSmsDao {
    @Query("SELECT smsId FROM imported_sms")
    fun observeIds(): Flow<List<Long>>

    @Query("SELECT smsId FROM imported_sms WHERE smsId IN (:ids)")
    suspend fun existing(ids: List<Long>): List<Long>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(rows: List<ImportedSms>)

    @Query("DELETE FROM imported_sms")
    suspend fun clear()
}

@Dao
interface DashboardDao {
    @Query("SELECT * FROM dashboard_cache WHERE id = 1")
    fun observe(): Flow<DashboardCache?>

    @Query("SELECT * FROM dashboard_cache WHERE id = 1")
    suspend fun get(): DashboardCache?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(cache: DashboardCache)

    @Query("DELETE FROM dashboard_cache")
    suspend fun clear()
}
