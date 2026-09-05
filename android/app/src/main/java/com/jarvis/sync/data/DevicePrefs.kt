package com.jarvis.sync.data

import android.content.Context

/**
 * Settings that belong to this phone rather than to the account: which server it talks to, and
 * whether the app asks for a fingerprint before it will show anything.
 *
 * Shares the "jarvis-device" file with [DeviceInfo], which already keeps this phone identity there.
 * Deliberately plain storage, and deliberately separate from [Credentials]: neither value is a
 * secret, and both have to survive signing out — the whole point of remembering the server address
 * is that nobody should have to type an IP again.
 */
class DevicePrefs(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences("jarvis-device", Context.MODE_PRIVATE)

    /** The last server that was signed in to, ready to be offered again. */
    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, null)?.takeIf { it.isNotBlank() } ?: DEFAULT_BASE_URL
        set(value) {
            prefs.edit().putString(KEY_BASE_URL, value.trim().trimEnd('/')).apply()
        }

    /** Whether a real address has been stored, as opposed to the bare scheme we start with. */
    val hasBaseUrl: Boolean get() = prefs.getString(KEY_BASE_URL, null).isNullOrBlank().not()

    /** Whether to require a fingerprint, face or the device PIN before showing the app. */
    var lockEnabled: Boolean
        get() = prefs.getBoolean(KEY_LOCK, false)
        set(value) {
            prefs.edit().putBoolean(KEY_LOCK, value).apply()
        }

    private companion object {
        const val KEY_BASE_URL = "baseUrl"
        const val KEY_LOCK = "biometricLock"
        const val DEFAULT_BASE_URL = "http://"
    }
}
