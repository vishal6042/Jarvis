package com.jarvis.sync.sms

/**
 * Cheap on-device heuristic: is this SMS plausibly a bank/UPI transaction alert? It just avoids
 * forwarding obvious noise (OTPs, promos) — the backend AI parser is the real classifier, and it
 * marks anything non-transactional as IGNORED, so false positives are harmless.
 */
object SmsFilter {

    private val amount = Regex("(?i)(?:rs\\.?|inr|₹)\\s?[0-9][0-9,]*(?:\\.[0-9]{1,2})?")

    private val txnKeywords = listOf(
        "debited", "credited", "debit", "credit", "spent", "withdrawn", "received",
        "paid", "payment", "txn", "transaction", "purchase", "upi", "a/c", "acct",
        "account", "avl bal", "avbl bal", "balance",
    )

    private val skipKeywords = listOf(
        "otp", "one time password", "one-time password", "verification code", "login code",
        "do not share", "congratulations", "you have won", "offer", "discount", "sale is live",
        "flat ", "cashback offer", "recharge now", "click here",
    )

    /** The first money figure in the message, e.g. "Rs 499.00" — display only; the backend parses properly. */
    fun amountOf(body: String): String? = amount.find(body)?.value?.trim()

    /** DEBIT / CREDIT guess from keywords, or null when unclear. */
    fun directionOf(body: String): String? {
        val b = body.lowercase()
        val credit = listOf("credited", "received", "deposited", "refund", "cashback received")
        val debit = listOf("debited", "spent", "paid", "withdrawn", "purchase", "payment of", "sent")
        val isCredit = credit.any { b.contains(it) }
        val isDebit = debit.any { b.contains(it) }
        return when {
            isCredit && !isDebit -> "CREDIT"
            isDebit && !isCredit -> "DEBIT"
            isDebit -> "DEBIT" // both words present (e.g. "debited ... credited to merchant") → treat as spend
            else -> null
        }
    }

    fun looksLikeTransaction(body: String?): Boolean {
        if (body.isNullOrBlank()) return false
        val b = body.lowercase()
        if (!amount.containsMatchIn(body)) return false          // must mention money
        if (skipKeywords.any { b.contains(it) }) return false     // OTP / promo → skip
        return txnKeywords.any { b.contains(it) }                 // needs a transaction word
    }
}
