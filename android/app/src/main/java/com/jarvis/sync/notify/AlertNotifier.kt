package com.jarvis.sync.notify

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
import com.jarvis.sync.MainActivity
import com.jarvis.sync.R
import com.jarvis.sync.data.NotificationDto

/**
 * Turns Jarvis notifications (budget breached, EMI due, card expiring, sync done) into phone
 * notifications. Remembers the highest id already shown so polling and the live stream never
 * repeat one.
 */
object AlertNotifier {

    private const val CHANNEL = "jarvis-alerts"
    private const val PREFS = "jarvis-alerts"
    private const val KEY_LAST = "lastNotifiedId"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Jarvis alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Budget, payment-due, card-expiry and sync alerts from your Jarvis server"
            }
        )
    }

    /** Show every unread notification newer than the last one shown (at most 5 at a time). */
    fun notifyNew(context: Context, items: List<NotificationDto>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST, 0L)
        val fresh = items
            .filter { !it.read }
            .mapNotNull { n -> n.id.toLongOrNull()?.let { it to n } }
            .filter { (id, _) -> id > last }
            .sortedBy { (id, _) -> id }
        if (fresh.isEmpty()) return
        fresh.takeLast(5).forEach { (id, n) -> show(context, id, n) }
        prefs.edit().putLong(KEY_LAST, fresh.last().first).apply()
    }

    private fun show(context: Context, id: Long, n: NotificationDto) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(n.title)
            .setContentText(n.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.message))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id.toInt(), notification) }
    }
}
