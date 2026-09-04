package com.jarvis.sync.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores the password encrypted at rest so the background worker can silently re-login when the JWT
 * expires (a forwarder must keep running for days without the user opening the app). Kept out of the
 * Room DB deliberately — only this one secret is encrypted.
 */
class Credentials(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            "jarvis-sync-secrets",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun savePassword(password: String) {
        prefs.edit().putString(KEY_PASSWORD, password).apply()
    }

    fun password(): String? = prefs.getString(KEY_PASSWORD, null)

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_PASSWORD = "password"
    }
}
