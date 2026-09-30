package com.jarvis.sync.data

import android.content.Context
import com.jarvis.sync.finance.merchantKey
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * What the model said about each merchant, and the suggestions waved away. Reading a merchant
 * takes the local model seconds, so every answer is kept on the phone and no merchant is asked
 * about twice; a "Keep" stays kept. Cleared on sign-out with the rest of the account's data.
 */
class ReviewStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences("jarvis-review", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    fun suggestions(): Map<String, EnrichedMerchantDto> =
        prefs.getString(KEY_SUGGESTIONS, null)
            ?.let { runCatching { json.decodeFromString<Map<String, EnrichedMerchantDto>>(it) }.getOrNull() }
            ?: emptyMap()

    fun addSuggestions(answers: List<EnrichedMerchantDto>, asked: List<String>) {
        val next = suggestions().toMutableMap()
        for (raw in asked) {
            val a = answers.firstOrNull { merchantKey(it.raw ?: "") == merchantKey(raw) } ?: continue
            next[merchantKey(raw)] = a.copy(raw = raw)
        }
        prefs.edit().putString(KEY_SUGGESTIONS, json.encodeToString(next)).apply()
    }

    fun dismissed(): Set<String> = prefs.getStringSet(KEY_DISMISSED, emptySet())?.toSet() ?: emptySet()

    fun dismiss(keys: Collection<String>) {
        prefs.edit().putStringSet(KEY_DISMISSED, dismissed() + keys).apply()
    }

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_SUGGESTIONS = "suggestions"
        const val KEY_DISMISSED = "dismissed"
    }
}
