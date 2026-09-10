package com.jarvis.sync.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/** Central place to (re)schedule delivery of the queued SMS. */
object SyncScheduler {

    private const val ONE_TIME = "jarvis-sync-once"

    /**
     * v2 deliberately: the old retry behaviour could leave this job pinned at WorkManager's 5-hour
     * backoff ceiling, and `KEEP` would then honour that stalled job forever. A new unique name
     * gives every phone one clean, un-backed-off periodic job as it upgrades.
     */
    private const val PERIODIC = "jarvis-sync-periodic-v2"
    private const val PERIODIC_LEGACY = "jarvis-sync-periodic"

    /** Marks the safety-net run, which must never trade its fixed period for a retry backoff. */
    const val KEY_PERIODIC = "periodic"

    private val networkConstraint = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** Try to flush the queue as soon as there's network (used after an SMS arrives, or "Sync now"). */
    fun syncNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraint)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build()
        // REPLACE rather than APPEND: the worker carries no payload, it drains whatever the durable
        // queue holds, so cancelling a pending attempt loses nothing. Appending did lose something --
        // it parked a fresh SMS, and every "Sync now" tap, behind a chain still serving its backoff.
        WorkManager.getInstance(context)
            .enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.REPLACE, request)
    }

    /** ~15-min safety-net so stragglers sync even if the one-time job was lost. */
    fun ensurePeriodic(context: Context) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(PERIODIC_LEGACY)
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraint)
            .setInputData(workDataOf(KEY_PERIODIC to true))
            .build()
        manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
