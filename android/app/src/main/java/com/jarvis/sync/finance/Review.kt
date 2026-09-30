package com.jarvis.sync.finance

import com.jarvis.sync.data.EnrichedMerchantDto
import com.jarvis.sync.data.TransactionDto
import java.time.LocalDate
import java.time.YearMonth

/*
 * "Needs a look": rows a person should glance at, and what Jarvis suggests for each. Ported from
 * the web app's components/transactions/queue.ts, less the admin-only merchant renames and the
 * duplicate pairs, which want the bigger screen.
 */

/** Categories offered on the phone; the ledger's own are folded in where they are used. */
val CATEGORIES = listOf(
    "Food", "Groceries", "Shopping", "Transport", "Bills & Utilities", "Entertainment",
    "Health", "Personal care", "Travel", "Education", "Rent", "Family support", "Investments", "Loan EMI",
    "Card Payment", "Transfers", "Income", "Miscellaneous",
)

/** A suggestion is taken by "Accept all confident" from this confidence up. */
const val CONFIDENT = 0.8

fun merchantKey(raw: String): String = raw.trim().lowercase()

fun isUncategorised(t: TransactionDto): Boolean = t.category.isNullOrBlank() || t.category == "Uncategorized"

/** No category, or no account to hang it on. */
fun needsReview(t: TransactionDto): Boolean =
    t.realFlow && (isUncategorised(t) || t.accountId == null)

/**
 * Money sent to someone and filed as "Transfers": the word reads like moving your own money, so
 * it counts as spending with nothing to say what it was for.
 */
fun paidToPerson(t: TransactionDto): Boolean =
    t.direction == "DEBIT" && t.category == "Transfers" && t.realFlow

/** One merchant's rows filed under a category the model thinks is wrong. */
data class CategoryFix(
    val key: String,
    val raw: String,
    val label: String,
    val from: String,
    val to: String,
    val reason: String?,
    val confidence: Double,
    val rows: List<TransactionDto>,
)

/** A row with no category (or no account), with the model's category when it has one. */
data class LooseRow(val txn: TransactionDto, val suggested: String?, val confidence: Double, val reason: String?)

data class ReviewQueue(
    val wrong: List<CategoryFix>,
    val people: List<TransactionDto>,
    val loose: List<LooseRow>,
    /** Raw merchants worth asking the model about. */
    val merchants: List<String>,
) {
    val count: Int get() = wrong.size + people.size + loose.size

    /** Every fix confident enough to take in one tap: row ids with the category they move to. */
    val confident: List<Pair<List<Long>, String>> get() =
        wrong.filter { it.confidence >= CONFIDENT }.map { f -> f.rows.map { it.id } to f.to } +
            loose.filter { it.suggested != null && it.confidence >= CONFIDENT }.map { listOf(it.txn.id) to it.suggested!! }
}

private fun norm(s: String?) = (s ?: "").trim().lowercase().replace(Regex("\\s+"), " ")

/**
 * @param rows the month's rows; the queue is drawn from these
 * @param suggestions the model's reads, keyed by [merchantKey]
 * @param dismissed keys waved away with "Keep"
 */
fun buildQueue(
    rows: List<TransactionDto>,
    suggestions: Map<String, EnrichedMerchantDto>,
    dismissed: Set<String>,
): ReviewQueue {
    val people = rows.filter { paidToPerson(it) && "person:${it.id}" !in dismissed }
    val peopleIds = people.map { it.id }.toSet()
    val review = rows.filter { needsReview(it) && it.id !in peopleIds && "row:${it.id}" !in dismissed }
    fun sug(t: TransactionDto) = t.merchant?.let { suggestions[merchantKey(it)] }

    val wrong = LinkedHashMap<String, CategoryFix>()
    for (t in rows) {
        if (t.direction != "DEBIT" || !t.realFlow || isUncategorised(t) || t.id in peopleIds) continue
        val s = sug(t) ?: continue
        val to = s.category ?: continue
        if (norm(to) == norm(t.category) || norm(to) == "uncategorized") continue
        val key = "cat:" + merchantKey(t.merchant ?: "") + "|" + t.category
        if (key in dismissed) continue
        val cur = wrong[key]
        wrong[key] = cur?.copy(rows = cur.rows + t) ?: CategoryFix(
            key = key,
            raw = t.merchant ?: "",
            label = merchantLabel(t),
            from = t.category ?: "",
            to = to,
            reason = s.reason,
            confidence = s.confidence ?: 0.5,
            rows = listOf(t),
        )
    }

    val loose = review.map { t ->
        val s = if (isUncategorised(t)) sug(t) else null
        val suggested = s?.category?.takeIf { norm(it) != "uncategorized" }
        LooseRow(t, suggested, if (suggested != null) s?.confidence ?: 0.5 else 0.0, if (suggested != null) s?.reason else null)
    }

    // Worth asking about: the review rows, plus every purchase's merchant (a wrong category can only
    // be spotted on a merchant the model has read).
    val merchants = (review + people + rows.filter { it.direction == "DEBIT" && it.realFlow })
        .mapNotNull { it.merchant?.trim()?.takeIf { m -> m.isNotEmpty() } }
        .distinctBy { merchantKey(it) }

    return ReviewQueue(wrong.values.sortedByDescending { it.confidence }, people, loose, merchants)
}

// ---------------------------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------------------------

/** One cell of the daily brief: what it is about, the fact, and a quieter line under it. */
data class BriefCell(val label: String, val value: String, val sub: String?, val tone: Tone = Tone.PLAIN) {
    enum class Tone { PLAIN, IN, OUT, WARN }
}

/** A category against its monthly budget. */
data class BudgetRead(val category: String, val spent: Double, val limit: Double) {
    val pct: Int get() = if (limit > 0) (spent / limit * 100).toInt() else 0
    val over: Boolean get() = limit > 0 && spent > limit
}

fun budgetReads(byCategory: Map<String, Double>, budgets: Map<String, Double>): List<BudgetRead> =
    budgets.filter { it.value > 0 }.map { (c, l) -> BudgetRead(c, byCategory[c] ?: 0.0, l) }
        .sortedByDescending { it.spent / it.limit }

/** Spending per category over some rows, by the shared spend rule. */
fun spendByCategory(rows: List<TransactionDto>, cardIds: Set<Long>): Map<String, Double> =
    rows.groupBy { it.category ?: "Uncategorized" }
        .mapValues { (_, rs) -> rs.sumOf { spendOf(it, cardIds) } }
        .filterValues { it > 0.5 }

/**
 * The four cells at the top of Ask, and the 8 am notification: what is coming in, what goes out
 * this week, what yesterday cost, and the one thing worth watching.
 */
fun briefCells(
    forecast: Forecast,
    txns: List<TransactionDto>,
    cardIds: Set<Long>,
    budgets: List<BudgetRead>,
    earns: Boolean,
    today: LocalDate = LocalDate.now(),
): List<BriefCell> {
    val salaryEvent = forecast.events.firstOrNull { it.kind == EventKind.INCOME }
    val coming = when {
        salaryEvent != null -> BriefCell(
            "Coming in",
            "Salary " + relativeDays(salaryEvent.on, today),
            "~" + lakh(salaryEvent.amount),
            BriefCell.Tone.IN,
        )
        forecast.salary.receivedThisMonth -> BriefCell("Coming in", "Salary is in", "next around day ${forecast.salary.dayOfMonth}")
        else -> BriefCell("Coming in", "Nothing expected", if (earns) "no regular salary found" else "no income of their own")
    }

    val outs = forecast.within(7).filter { it.amount < 0 || it.unknown }
    val due = if (outs.isEmpty()) {
        BriefCell("Due this week", "Nothing due", "no bills in the next 7 days")
    } else {
        val first = outs.first()
        val rest = outs.drop(1)
        BriefCell(
            "Due this week",
            first.label.removeSuffix(" (expected)") + " " + (if (first.unknown) "" else lakh(-first.amount) + " ") + "· " + dayMonth(first.on),
            if (rest.isEmpty()) null else "+${rest.size} more · " + lakh(rest.sumOf { -it.amount }),
            if (rest.isEmpty()) BriefCell.Tone.PLAIN else BriefCell.Tone.OUT,
        )
    }

    val y = today.minusDays(1)
    val yRows = txns.filter { it.day() == y }
    val spent = yRows.sumOf { spendOf(it, cardIds) }
    val largest = yRows.filter { spendOf(it, cardIds) > 0 }.maxByOrNull { it.amount }
    val yesterday = if (spent > 0) {
        BriefCell("Yesterday", rupees(spent) + " spent", largest?.let { merchantLabel(it) })
    } else {
        BriefCell("Yesterday", "Nothing spent", dayMonth(y))
    }

    val over = budgets.filter { it.over }.maxByOrNull { it.spent / it.limit }
    val watch = when {
        !forecast.healthy -> BriefCell("Watch", "Balance dips to " + lakh(forecast.minBalance), "below your reserve on " + dayMonth(forecast.minOn), BriefCell.Tone.WARN)
        over != null -> BriefCell("Watch", "${over.category} ${over.pct}%", "of " + lakh(over.limit) + " budget", BriefCell.Tone.WARN)
        else -> BriefCell("Watch", "Nothing to flag", "no budgets over")
    }
    return listOf(coming, due, yesterday, watch)
}

// ---------------------------------------------------------------------------------------------
// Do this next
// ---------------------------------------------------------------------------------------------

/** Something worth doing now, with where it leads. */
data class NextAction(
    val chip: String,
    val tone: BriefCell.Tone,
    val amount: Double?,
    val headline: String?,
    val detail: String,
    val button: String?,
    val target: Target,
) {
    sealed interface Target {
        data class Statement(val accountId: Long) : Target
        data class Category(val category: String) : Target
        data object Review : Target
        data object Inbox : Target
        data class Reminder(val reminderId: Long, val on: LocalDate, val amount: Double?) : Target
        data object Wealth : Target
    }
}

fun nextActions(
    statements: List<Statement>,
    budgets: List<BudgetRead>,
    reviewCount: Int,
    unreadSms: Int,
    overdue: List<Occurrence>,
    offPace: List<GoalRead>,
    today: LocalDate = LocalDate.now(),
): List<NextAction> {
    val out = mutableListOf<NextAction>()
    for (s in statements.filter { it.summary.billDue > 0 && it.dueOn != null }.sortedBy { it.dueOn }) {
        val days = daysTo(s.dueOn!!, today)
        if (days > 10) continue
        out += NextAction(
            chip = when {
                days < 0 -> "Overdue"
                days == 0L -> "Due today"
                days == 1L -> "Tomorrow"
                else -> "In $days days"
            },
            tone = BriefCell.Tone.OUT,
            amount = s.summary.billDue,
            headline = null,
            detail = s.name + " bill · due " + dayMonth(s.dueOn!!),
            button = "View statement",
            target = NextAction.Target.Statement(s.summary.accountId),
        )
    }
    for (o in overdue) {
        out += NextAction(
            "Overdue", BriefCell.Tone.OUT, o.reminder.amount, if (o.reminder.amount == null) o.reminder.title else null,
            o.reminder.title + " · was due " + dayMonth(o.on), "Mark paid",
            NextAction.Target.Reminder(o.reminder.id, o.on, o.reminder.amount),
        )
    }
    for (b in budgets.filter { it.over }) {
        out += NextAction(
            "Over budget", BriefCell.Tone.WARN, b.spent, null,
            b.category + " · budget " + rupees(b.limit), "See what",
            NextAction.Target.Category(b.category),
        )
    }
    if (reviewCount > 0) {
        out += NextAction(
            "Needs a look", BriefCell.Tone.WARN, null, "$reviewCount transaction" + (if (reviewCount == 1) "" else "s"),
            "no category, or filed where it reads wrong", "Review", NextAction.Target.Review,
        )
    }
    if (unreadSms > 0) {
        out += NextAction(
            "Couldn't read", BriefCell.Tone.OUT, null, "$unreadSms bank SMS",
            "Jarvis could not read the amount", "Open", NextAction.Target.Inbox,
        )
    }
    for (g in offPace.take(1)) {
        out += NextAction(
            "Off pace", BriefCell.Tone.OUT, g.remaining, null,
            g.goal.name + " · " + (g.needed?.let { "needs " + inWords(it) + " a month" } ?: "past its date"),
            "See the plan", NextAction.Target.Wealth,
        )
    }
    return out
}

/** Reminder occurrences from the last few days still not paid. */
fun overdueOccurrences(
    reminders: List<com.jarvis.sync.data.ReminderDto>,
    txns: List<TransactionDto>,
    paidKeys: Set<String>,
    today: LocalDate = LocalDate.now(),
): List<Occurrence> =
    occurrences(reminders, today.minusDays(5), today.minusDays(1)).filter { !isPaid(it, txns, paidKeys) }

/** Reminder occurrences this month up to today, and how many of them are paid. */
fun paidThisMonth(
    reminders: List<com.jarvis.sync.data.ReminderDto>,
    txns: List<TransactionDto>,
    paidKeys: Set<String>,
    today: LocalDate = LocalDate.now(),
): Pair<Int, Int> {
    val occ = occurrences(reminders, YearMonth.from(today).atDay(1), today)
    return occ.count { isPaid(it, txns, paidKeys) } to occ.size
}
