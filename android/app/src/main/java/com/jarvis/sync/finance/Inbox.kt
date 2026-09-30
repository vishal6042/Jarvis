package com.jarvis.sync.finance

/*
 * What became of each bank SMS, for the Inbox summary. A message can have been sent more than
 * once (before 1.2.0 the phone did that a lot), so its outcome is read across every verdict the
 * server gave it: what it counted as, and whether a second copy was turned away.
 */

enum class SmsOutcome { SAVED, DEPOSIT, NOT_PAYMENT, FAILED, TWICE, WAITING }

/** One server verdict on one inbox message, oldest first when there are several. */
data class Verdict(
    val status: String,
    val detail: String?,
    val rawMessageId: Long?,
    val transactionId: Long?,
)

data class SmsRead(
    val outcome: SmsOutcome,
    /** Counted, and a second copy was also turned away as a duplicate. */
    val alsoTwice: Boolean,
    /** The verdict the outcome rests on (null while nothing has come back). */
    val verdict: Verdict?,
)

/**
 * @param verdicts every verdict for this message, oldest first
 * @param inFlight queued or sent without an answer yet
 */
fun readSms(verdicts: List<Verdict>, inFlight: Boolean): SmsRead {
    if (verdicts.isEmpty()) return SmsRead(SmsOutcome.WAITING, false, null)
    val twice = verdicts.any { it.status == "DUPLICATE" }
    // The latest decisive answer wins: a retry that succeeded replaces the failure before it.
    val decisive = verdicts.lastOrNull { it.status != "DUPLICATE" }
    if (decisive == null) return SmsRead(SmsOutcome.TWICE, false, verdicts.last())
    val outcome = when (decisive.status) {
        "PARSED" -> SmsOutcome.SAVED
        "INVESTMENT" -> SmsOutcome.DEPOSIT
        "IGNORED" -> SmsOutcome.NOT_PAYMENT
        else -> if (inFlight) SmsOutcome.WAITING else SmsOutcome.FAILED
    }
    return SmsRead(outcome, twice && outcome != SmsOutcome.FAILED, decisive)
}
