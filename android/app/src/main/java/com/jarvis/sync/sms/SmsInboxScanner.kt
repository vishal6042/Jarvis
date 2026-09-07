package com.jarvis.sync.sms

import android.content.Context
import android.provider.Telephony

/** One SMS from the phone's inbox that looks like a bank/UPI transaction alert. */
data class InboxSms(val id: Long, val sender: String?, val body: String, val receivedAt: Long)

/**
 * Reads the device's SMS inbox (needs READ_SMS) and returns the messages that pass [SmsFilter],
 * newest first. Used for the one-off "import existing bank SMS" backfill — the live path is
 * [SmsReceiver], which sees each new message as it arrives.
 */
object SmsInboxScanner {

    private val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE,
    )

    /** @param sinceMillis only messages received at/after this epoch time; 0 = whole inbox. */
    fun scan(context: Context, sinceMillis: Long = 0L): List<InboxSms> {
        val out = mutableListOf<InboxSms>()
        val selection = if (sinceMillis > 0) "${Telephony.Sms.DATE} >= ?" else null
        val args = if (sinceMillis > 0) arrayOf(sinceMillis.toString()) else null
        context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            selection,
            args,
            "${Telephony.Sms.DATE} DESC",
        )?.use { c ->
            val idCol = c.getColumnIndexOrThrow(Telephony.Sms._ID)
            val addrCol = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyCol = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateCol = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (c.moveToNext()) {
                val body = c.getString(bodyCol) ?: continue
                if (!SmsFilter.looksLikeTransaction(body)) continue
                out += InboxSms(
                    id = c.getLong(idCol),
                    sender = c.getString(addrCol),
                    body = body,
                    receivedAt = c.getLong(dateCol),
                )
            }
        }
        return out
    }

    /**
     * The inbox `_id` of a message that was captured live, or null when it cannot be found.
     *
     * The SMS_RECEIVED broadcast carries no `_id` -- the message is usually not written to the
     * provider until after it fires -- so [SmsReceiver] cannot record one. Resolving it later, at
     * delivery time, is what lets the Inbox tab tell that a message it can see has already been
     * forwarded, instead of offering it for a manual sync and creating a second copy.
     *
     * Matched on the exact body within a few minutes of the timestamp: the service-centre time on
     * the broadcast and the provider's own DATE for the same message can differ by seconds.
     */
    fun findId(context: Context, sender: String?, body: String, receivedAt: Long): Long? {
        val window = 5 * 60 * 1000L
        return context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.DATE} <= ?",
            arrayOf((receivedAt - window).toString(), (receivedAt + window).toString()),
            "${Telephony.Sms.DATE} DESC",
        )?.use { c ->
            val idCol = c.getColumnIndexOrThrow(Telephony.Sms._ID)
            val addrCol = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyCol = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            while (c.moveToNext()) {
                if (c.getString(bodyCol) != body) continue
                // The address is only a tie-breaker -- some networks rewrite it slightly, and an
                // identical body within the same few minutes is already the message we want.
                val addr = c.getString(addrCol)
                if (sender != null && addr != null && addr != sender) continue
                return@use c.getLong(idCol)
            }
            null
        }
    }
}
