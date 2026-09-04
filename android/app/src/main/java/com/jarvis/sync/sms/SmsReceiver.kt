package com.jarvis.sync.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.jarvis.sync.data.SyncRepository
import com.jarvis.sync.work.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Fires on every incoming SMS. Reassembles multipart parts, filters to likely transaction alerts,
 * persists the survivor to the durable queue (so it's safe even if we're killed immediately), and
 * kicks the sync worker. Network I/O is NOT done here — only a fast DB write.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return

        val sender = parts[0].displayOriginatingAddress
        val body = parts.joinToString(separator = "") { it.messageBody ?: "" }
        val timestamp = parts[0].timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()

        if (!SmsFilter.looksLikeTransaction(body)) return

        val app = context.applicationContext
        val repo = SyncRepository.get(app)
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val session = repo.session()
                if (session != null && session.forwardingEnabled) {
                    repo.enqueue(body, sender, timestamp)
                    SyncScheduler.syncNow(app)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
