package com.jarvis.sync.data

import android.content.Context
import android.os.Build
import java.util.UUID

/** Stable per-install identity + what this phone is, for the device heartbeat. */
object DeviceInfo {

    private const val PREFS = "jarvis-device"
    private const val KEY_ID = "deviceId"
    private const val KEY_FORWARDED = "forwardedTotal"
    private const val KEY_LAST_SYNC = "lastSyncAt"

    fun id(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getString(KEY_ID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_ID, it).apply()
        }
    }

    fun name(): String = Build.MODEL ?: "Android phone"
    fun manufacturer(): String = (Build.MANUFACTURER ?: "").replaceFirstChar { it.uppercase() }
    fun model(): String = Build.MODEL ?: ""
    fun osVersion(): String = Build.VERSION.RELEASE ?: ""

    fun appVersion(context: Context): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
    }.getOrDefault("?")

    fun forwardedTotal(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_FORWARDED, 0L)

    fun bumpForwarded(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putLong(KEY_FORWARDED, prefs.getLong(KEY_FORWARDED, 0L) + 1)
            .putLong(KEY_LAST_SYNC, System.currentTimeMillis()).apply()
    }

    fun lastSyncAt(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_LAST_SYNC, 0L)
}
