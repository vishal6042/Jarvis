package com.jarvis.sync

import android.app.Application
import com.jarvis.sync.work.SyncScheduler

class JarvisSyncApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Arm the ~15-min safety-net so queued messages sync even if a one-time job was dropped.
        SyncScheduler.ensurePeriodic(this)
    }
}
