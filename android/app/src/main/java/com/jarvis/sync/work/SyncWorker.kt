package com.jarvis.sync.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.jarvis.sync.data.SyncRepository

/**
 * Drains the durable pending queue. A captured SMS is never dropped: it leaves the queue only on a
 * definitive server response, so a run that delivers nothing costs nothing but the attempt.
 */
class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val repo = SyncRepository.get(applicationContext)
        return try {
            val drained = repo.flush()
            repo.pollAlerts(applicationContext) // every run (incl. the 15-min safety net) surfaces new server alerts
            repo.heartbeat() // and tells the server this phone is alive + its queue state
            if (drained) Result.success() else retryWhileItIsStillQuick()
        } catch (e: Exception) {
            retryWhileItIsStillQuick()
        }
    }

    /**
     * Retry only while a retry is still soon, then report success and leave the rest to the
     * safety net.
     *
     * Asking for a retry every time is what silently stalled this app for days. WorkManager doubles
     * the backoff on each failure up to a five-hour ceiling, and a periodic worker that retries
     * gives up its fifteen-minute period for that same backoff. So one server outage long enough to
     * climb the ladder left a phone that was online the whole time trying twice a day -- and the
     * queue only grew. Stopping instead loses nothing, because the queue is durable and the next
     * run picks it up untouched.
     */
    private fun retryWhileItIsStillQuick(): Result {
        val periodic = inputData.getBoolean(SyncScheduler.KEY_PERIODIC, false)
        return if (!periodic && runAttemptCount < MAX_FAST_RETRIES) Result.retry() else Result.success()
    }

    private companion object {
        /** 10s, 20s, 40s, 80s, 160s -- about five minutes of chasing before the safety net takes it. */
        const val MAX_FAST_RETRIES = 5
    }
}
