package com.jarvis.sync

import com.jarvis.sync.notify.AlertNotifier

import android.app.Application
import com.jarvis.sync.work.SyncScheduler

class JarvisSyncApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Arm the ~15-min safety-net so queued messages sync even if a one-time job was dropped.
        SyncScheduler.ensurePeriodic(this)
        // And flush right away. Opening the app is the one moment we know someone wants their
        // spending up to date, and it is the dependable way out of a backoff the phone would
        // otherwise sit in for hours.
        SyncScheduler.syncNow(this)
        AlertNotifier.ensureChannel(this)
    }
}
