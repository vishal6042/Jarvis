package com.jarvis.sync.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.jarvis.sync.MainActivity
import com.jarvis.sync.R
import com.jarvis.sync.data.DevicePrefs
import com.jarvis.sync.data.SyncRepository
import com.jarvis.sync.finance.MoneyModel
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * The morning brief: at 8 am, the same four lines Ask opens with, as a notification. It runs on
 * the phone rather than the server, so turning it on needs nothing from the PC beyond the usual
 * refresh -- and if the PC is off it still sends what it last knew.
 */
class BriefWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val prefs = DevicePrefs(applicationContext)
        if (!prefs.morningBrief) return Result.success()
        val repo = SyncRepository.get(applicationContext)
        runCatching { repo.refreshDashboard() }
        runCatching {
            val cache = repo.dashboardNow() ?: return@runCatching
            val x = repo.parseExtras(cache) ?: return@runCatching
            val model = MoneyModel(cache, x, prefs.reserve)
            val lines = model.brief.map { c -> c.label + ": " + c.value + (c.sub?.let { " · $it" } ?: "") }
            post(applicationContext, "Your money today", lines)
        }
        BriefScheduler.scheduleNext(applicationContext)
        return Result.success()
    }

    private fun post(context: Context, title: String, lines: List<String>) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        BriefScheduler.ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 1, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val style = NotificationCompat.InboxStyle().also { s -> lines.forEach { s.addLine(it) } }
        val n = NotificationCompat.Builder(context, BriefScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(lines.firstOrNull() ?: "")
            .setStyle(style)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(BriefScheduler.NOTIFICATION_ID, n) }
    }
}

object BriefScheduler {
    const val CHANNEL = "jarvis-brief"
    const val NOTIFICATION_ID = 8_000
    private const val WORK = "jarvis-morning-brief"
    private val AT: LocalTime = LocalTime.of(8, 0)

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Morning brief", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Today's money at 8 am: what is coming in, what is due, yesterday's spend"
            }
        )
    }

    /** Turn the brief on or off; on schedules the next 8 am, off cancels it. */
    fun set(context: Context, on: Boolean) {
        DevicePrefs(context).morningBrief = on
        if (on) scheduleNext(context, ExistingWorkPolicy.REPLACE)
        else WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    /** At app start: make sure a brief that is on has its next run queued. */
    fun ensure(context: Context) {
        if (DevicePrefs(context).morningBrief) scheduleNext(context, ExistingWorkPolicy.KEEP)
    }

    fun scheduleNext(context: Context, policy: ExistingWorkPolicy = ExistingWorkPolicy.REPLACE) {
        val now = LocalDateTime.now()
        var next = now.toLocalDate().atTime(AT)
        if (!next.isAfter(now.plusMinutes(1))) next = next.plusDays(1)
        val delay = Duration.between(now, next).toMillis()
        val request = OneTimeWorkRequestBuilder<BriefWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, policy, request)
    }
}
