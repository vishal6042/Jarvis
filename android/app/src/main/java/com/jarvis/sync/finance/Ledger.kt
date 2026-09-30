package com.jarvis.sync.finance

import com.jarvis.sync.data.AccountDto
import com.jarvis.sync.data.TransactionDto
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/*
 * The rules every screen shares for reading the ledger: which day a row falls on, what counts as
 * spending, what counts as money coming in, and how an amount is written. They mirror the web
 * app's (lib/report.ts, lib/forecast.ts, lib/format.ts) so the phone and the browser never
 * disagree about the same month.
 */

/** The day a transaction happened, in the phone's own time zone (the server stores instants). */
fun TransactionDto.day(zone: ZoneId = ZoneId.systemDefault()): LocalDate =
    runCatching { Instant.parse(occurredAt).atZone(zone).toLocalDate() }
        .getOrElse { runCatching { LocalDate.parse(occurredAt.take(10)) }.getOrDefault(LocalDate.MIN) }

/** Real money moving in or out of the household, not a shuffle between its own accounts. */
val TransactionDto.realFlow: Boolean get() = !transfer && !settlement

/** Ids of the credit cards, where a credit is a refund rather than income. */
fun cardIdsOf(accounts: List<AccountDto>): Set<Long> =
    accounts.filter { it.type != "SAVINGS" }.map { it.id }.toSet()

/**
 * What a row adds to spending: a purchase adds, a card refund takes away, a transfer between own
 * accounts or a card bill payment does not count at all (the purchases already did).
 */
fun spendOf(t: TransactionDto, cardIds: Set<Long>): Double = when {
    !t.realFlow -> 0.0
    t.direction == "DEBIT" -> t.amount
    t.accountId != null && t.accountId in cardIds -> -t.amount
    else -> 0.0
}

/** What a row adds to income: a real credit into a bank account (not a refund on a card). */
fun earningOf(t: TransactionDto, cardIds: Set<Long>): Double =
    if (t.realFlow && t.direction == "CREDIT" && t.accountId != null && t.accountId !in cardIds) t.amount else 0.0

fun inMonth(t: TransactionDto, ym: YearMonth): Boolean = YearMonth.from(t.day()) == ym

/** A readable name for the row: the cleaned merchant, else a tidied raw one, else its category. */
fun merchantLabel(t: TransactionDto): String =
    t.merchantNorm?.takeIf { it.isNotBlank() }
        ?: t.merchant?.takeIf { it.isNotBlank() }?.let(::tidyMerchant)
        ?: t.category
        ?: "Transaction"

/** "ORIENT EXCHANGE" → "Orient Exchange"; mixed-case text is left as the bank wrote it. */
fun tidyMerchant(raw: String): String {
    val s = raw.trim().replace(Regex("\\s+"), " ")
    if (s.any { it.isLowerCase() }) return s
    return s.lowercase().split(' ').joinToString(" ") { w -> w.replaceFirstChar { it.titlecase(Locale.ROOT) } }
}

/** One or two letters for a row's avatar. */
fun initials(name: String): String {
    val words = name.replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(1).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}

/** "Bandhan 8519" for a bank account, "card 0009" for a card: the list's meta line. */
fun shortAccount(t: TransactionDto, byId: Map<Long, AccountDto>): String? {
    val a = t.accountId?.let { byId[it] } ?: return t.accountName
    if (a.type != "SAVINGS") return "card " + (a.last4 ?: "")
    return listOfNotNull(a.bank?.split(Regex("\\s+"))?.firstOrNull(), a.last4).joinToString(" ").ifBlank { a.displayName }
}

fun median(xs: List<Double>): Double {
    val s = xs.sorted()
    return if (s.isEmpty()) 0.0 else s[s.size / 2]
}

// ---------------------------------------------------------------------------------------------
// Writing amounts
// ---------------------------------------------------------------------------------------------

/** Rupees with Indian digit grouping: ₹1,23,456 (negative as −₹…). */
fun rupees(v: Double): String {
    val n = v.roundToLong()
    val s = abs(n).toString()
    val grouped = if (s.length <= 3) s else s.dropLast(3).reversed().chunked(2).joinToString(",").reversed() + "," + s.takeLast(3)
    return (if (n < 0) "−₹" else "₹") + grouped
}

/**
 * A figure at a glance, to three significant digits: ₹79.8L, ₹2.13L, ₹4.1Cr, ₹20K — the way the
 * web app's compact figures read. Below a thousand it is exact.
 */
fun lakh(v: Double): String {
    val a = abs(v)
    val sign = if (v < 0) "−" else ""
    fun sig3(x: Double): String {
        val digits = when {
            x >= 100 -> 0
            x >= 10 -> 1
            else -> 2
        }
        return String.format(Locale.US, "%.${digits}f", x).let { if (it.contains('.')) it.trimEnd('0').trimEnd('.') else it }
    }
    return sign + when {
        a >= 1e7 -> "₹" + sig3(a / 1e7) + "Cr"
        a >= 1e5 -> "₹" + sig3(a / 1e5) + "L"
        a >= 1e3 -> "₹" + sig3(a / 1e3) + "K"
        else -> "₹" + a.roundToLong()
    }
}

/** Exact below a lakh, compact from a lakh up: how a figure reads inside a sentence. */
fun inWords(v: Double): String = if (abs(v) >= 1e5) lakh(v) else rupees(v)

private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
private val DAY_HEADING = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
private val MONTH_YEAR = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)
private val MONTH_LONG = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)

/** "5 Oct". Indian English writes September as "Sept"; so does the web app. */
fun dayMonth(d: LocalDate): String = sept(d.format(DAY_MONTH))

/** "Mon 28 Sept", with the year only when it is not this one. */
fun dayHeading(d: LocalDate, today: LocalDate = LocalDate.now()): String =
    sept(d.format(DAY_HEADING)) + if (d.year != today.year) " " + d.year else ""

fun monthYear(d: LocalDate): String = sept(d.format(MONTH_YEAR))
fun monthLong(ym: YearMonth): String = ym.atDay(1).format(MONTH_LONG)
fun monthShortName(ym: YearMonth): String = sept(ym.month.getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH))

private fun sept(s: String) = s.replace("Sep ", "Sept ").let { if (it.endsWith("Sep")) it + "t" else it }

/** "today", "tomorrow", "in 3 days", "3 days ago". */
fun relativeDays(on: LocalDate, today: LocalDate = LocalDate.now()): String {
    val days = java.time.temporal.ChronoUnit.DAYS.between(today, on)
    return when {
        days == 0L -> "today"
        days == 1L -> "tomorrow"
        days == -1L -> "yesterday"
        days > 1 -> "in $days days"
        else -> "${-days} days ago"
    }
}
