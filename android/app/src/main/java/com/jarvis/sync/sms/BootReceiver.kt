package com.jarvis.sync.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.jarvis.sync.work.SyncScheduler

/** After a reboot, re-arm the periodic safety-net and try to flush anything queued before the reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val app = context.applicationContext
            SyncScheduler.ensurePeriodic(app)
            SyncScheduler.syncNow(app)
        }
    }
}
