package com.jarvis.sync.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.jarvis.sync.data.SyncRepository

/**
 * Drains the durable pending queue. Returns retry() while anything is still undelivered (network
 * down, server unreachable, unrecoverable auth) so WorkManager backs off and tries again — the
 * captured SMS is never dropped.
 */
class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val repo = SyncRepository.get(applicationContext)
        return try {
            if (repo.flush()) Result.success() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
