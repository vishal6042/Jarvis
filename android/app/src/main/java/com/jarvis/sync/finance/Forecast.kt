package com.jarvis.sync.finance

import com.jarvis.sync.data.CardSummaryDto
import com.jarvis.sync.data.ReminderDto
import com.jarvis.sync.data.TransactionDto
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/*
 * The next thirty days, worked out the way the web app's lib/forecast.ts does: the savings
 * balance today, then every reminder still to pay, every card bill with a balance due, and the
 * salary if it has not landed yet. Everything else on Home — the runway chart, the next 14 days,
 * "safe to spend" and the brief — reads from this one projection.
 */

data class SalaryEstimate(
    /** Median of the last three months' biggest real credits into a bank account. */
    val amount: Double,
    val dayOfMonth: Int,
    val receivedThisMonth: Boolean,
    /** How many months the estimate rests on; 0 means no idea. */
    val basis: Int,
)

/**
 * @param earns false for a member with no income of their own: money reaching their account is a
 *   transfer from the household, not a salary that will land again, so none is predicted.
 */
fun inferSalary(
    txns: List<TransactionDto>,
    cardIds: Set<Long>,
    today: LocalDate = LocalDate.now(),
    earns: Boolean = true,
): SalaryEstimate {
    val none = SalaryEstimate(0.0, 31, false, 0)
    if (!earns) return none
    val credits = txns.filter { it.direction == "CREDIT" && it.realFlow && it.accountId != null && it.accountId !in cardIds }
    val perMonth = (1..3).mapNotNull { back ->
        val ym = YearMonth.from(today).minusMonths(back.toLong())
        credits.filter { YearMonth.from(it.day()) == ym }.maxByOrNull { it.amount }
    }
    if (perMonth.isEmpty()) return none
    val amount = median(perMonth.map { it.amount })
    val day = median(perMonth.map { it.day().dayOfMonth.toDouble() }).toInt()
    val thisMonth = YearMonth.from(today)
    val received = credits.any { YearMonth.from(it.day()) == thisMonth && it.amount >= amount * 0.6 }
    return SalaryEstimate(amount, day, received, perMonth.size)
}

/**
 * What the household typically keeps a month: the median, over the last three complete months, of
 * money coming into bank accounts less everything spent (from a bank account or on a card).
 */
fun monthlyKeep(txns: List<TransactionDto>, cardIds: Set<Long>, today: LocalDate = LocalDate.now()): Pair<Double, Int> {
    val nets = (1..3).mapNotNull { back ->
        val ym = YearMonth.from(today).minusMonths(back.toLong())
        val rows = txns.filter { it.realFlow && YearMonth.from(it.day()) == ym }
        if (rows.isEmpty()) return@mapNotNull null
        val inflow = rows.filter { it.direction == "CREDIT" && it.accountId !in cardIds }.sumOf { it.amount }
        val outflow = rows.filter { it.direction == "DEBIT" }.sumOf { it.amount }
        inflow - outflow
    }
    return median(nets) to nets.size
}

// ---------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------

data class Occurrence(val reminder: ReminderDto, val on: LocalDate) {
    val key: String get() = "${reminder.id}:$on"
}

/** Every dated occurrence of the reminders between two days, monthly ones repeated each month. */
fun occurrences(reminders: List<ReminderDto>, from: LocalDate, to: LocalDate): List<Occurrence> =
    reminders.flatMap { r ->
        val base = runCatching { LocalDate.parse(r.date.take(10)) }.getOrNull() ?: return@flatMap emptyList()
        if (!r.repeat.equals("monthly", ignoreCase = true)) {
            return@flatMap if (!base.isBefore(from) && !base.isAfter(to)) listOf(Occurrence(r, base)) else emptyList()
        }
        val out = mutableListOf<Occurrence>()
        var ym = YearMonth.from(from)
        while (!ym.atDay(1).isAfter(to)) {
            val d = ym.atDay(min(base.dayOfMonth, ym.lengthOfMonth()))
            if (!d.isBefore(from) && !d.isAfter(to) && !d.isBefore(base)) out += Occurrence(r, d)
            ym = ym.plusMonths(1)
        }
        out
    }.sortedBy { it.on }

/**
 * Whether an occurrence is paid: closed by hand, or a debit of about that amount (within 2%)
 * went out between five days before and two days after it was due.
 */
fun isPaid(o: Occurrence, txns: List<TransactionDto>, paidKeys: Set<String>): Boolean {
    if (o.key in paidKeys) return true
    val amt = o.reminder.amount ?: return false
    if (amt <= 0) return false
    return txns.any { t ->
        t.direction == "DEBIT" && abs(t.amount - amt) <= amt * 0.02 &&
            t.day().let { !it.isBefore(o.on.minusDays(5)) && !it.isAfter(o.on.plusDays(2)) }
    }
}

// ---------------------------------------------------------------------------------------------
// Card statements
// ---------------------------------------------------------------------------------------------

/** One bill as the bank sends it: a card on its own, or several sharing one statement. */
data class Statement(
    /** The statement's figures; unbilled summed over its cards. */
    val summary: CardSummaryDto,
    val members: List<CardSummaryDto>,
    val name: String,
) {
    val accountIds: List<Long> get() = members.map { it.accountId }
    val dueOn: LocalDate? get() = summary.dueOn?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    val nextStatementOn: LocalDate? get() = summary.nextStatementOn?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    /** The statement date the current bill was cut on (a month before the next one). */
    val lastStatementOn: LocalDate? get() = nextStatementOn?.minusMonths(1)
}

/**
 * A card's name without the "•••• 4008" its saved name carries: the last four are shown on their
 * own line where they matter, and in a sentence ("… bill · due 5 Oct") they only crowd it.
 */
fun cardName(displayName: String): String =
    displayName.substringBefore("••").trim().ifEmpty { displayName.trim() }

/** Cards grouped into the statements they are billed on, in the order the cards come. */
fun statementsOf(cards: List<CardSummaryDto>): List<Statement> {
    val seen = mutableSetOf<String>()
    return cards.mapNotNull { c ->
        val group = c.billingGroup
        if (group == null) return@mapNotNull Statement(c, listOf(c), cardName(c.displayName))
        if (!seen.add(group)) return@mapNotNull null
        val members = cards.filter { it.billingGroup == group }
        if (members.size < 2) return@mapNotNull Statement(c, members, cardName(c.displayName))
        Statement(
            summary = c.copy(unbilled = members.sumOf { it.unbilled }),
            members = members,
            name = (c.bank ?: c.displayName.substringBefore(" ")) + " · one statement",
        )
    }
}

/** Card rows between two days, bill payments left out, biggest first. */
fun purchasesBetween(txns: List<TransactionDto>, accountIds: Collection<Long>, from: LocalDate, to: LocalDate) =
    txns.filter { it.accountId != null && it.accountId in accountIds && !it.settlement }
        .filter { val d = it.day(); !d.isBefore(from) && !d.isAfter(to) }
        .sortedByDescending { it.day() }

/** A bill already cut, rebuilt from the ledger: what it billed and what was paid against it. */
data class PastStatement(val on: LocalDate, val from: LocalDate, val to: LocalDate, val billed: Double, val paid: Double)

fun pastStatements(s: Statement, txns: List<TransactionDto>, count: Int = 6): List<PastStatement> {
    val last = s.lastStatementOn ?: return emptyList()
    return (1..count).map { k ->
        val on = last.minusMonths(k.toLong())
        val from = on.minusMonths(1)
        val to = on.minusDays(1)
        val rows = purchasesBetween(txns, s.accountIds, from, to)
        val billed = rows.sumOf { if (it.direction == "DEBIT") it.amount else -it.amount }
        val paid = txns.filter {
            it.settlement && it.direction == "CREDIT" && it.accountId in s.accountIds &&
                it.day().let { d -> !d.isBefore(on) && d.isBefore(on.plusMonths(1)) }
        }.sumOf { it.amount }
        PastStatement(on, from, to, billed, paid)
    }.filter { it.billed != 0.0 || it.paid != 0.0 }
}

// ---------------------------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------------------------

enum class EventKind { START, INCOME, REMINDER, CARD, END }

data class ForecastEvent(
    val on: LocalDate,
    val label: String,
    /** Signed: income positive, outflows negative; 0 for the start and end rows. */
    val amount: Double,
    val kind: EventKind,
    val balanceAfter: Double = 0.0,
    /** A reminder with no amount: shown, not counted. */
    val unknown: Boolean = false,
    /** The card statement, for a card bill, so tapping it opens the bill. */
    val statementAccountId: Long? = null,
    val reminderId: Long? = null,
)

data class Forecast(
    val today: LocalDate,
    val startBalance: Double,
    val events: List<ForecastEvent>,
    val projected: Double,
    val projectedOn: LocalDate,
    val minBalance: Double,
    val minOn: LocalDate,
    val reserve: Double,
    val salary: SalaryEstimate,
    val committedThisMonth: Double,
    val incomeThisMonth: Double,
    /** Balance + income still due this month − commitments this month − the reserve, floored at 0. */
    val safeToSpend: Double,
) {
    val healthy: Boolean get() = minBalance >= reserve

    /** The real events (no start/end rows) up to a number of days ahead. */
    fun within(days: Long): List<ForecastEvent> =
        events.filter { it.kind != EventKind.START && it.kind != EventKind.END && !it.on.isAfter(today.plusDays(days)) }
}

fun buildForecast(
    balance: Double,
    txns: List<TransactionDto>,
    reminders: List<ReminderDto>,
    cards: List<CardSummaryDto>,
    cardIds: Set<Long>,
    reserve: Double,
    paidKeys: Set<String>,
    earns: Boolean = true,
    today: LocalDate = LocalDate.now(),
    horizonDays: Long = 30,
): Forecast {
    val horizonEnd = today.plusDays(horizonDays)
    val monthEnd = YearMonth.from(today).atEndOfMonth()
    val salary = inferSalary(txns, cardIds, today, earns)
    val statements = statementsOf(cards)
    val raw = mutableListOf<ForecastEvent>()

    for (o in occurrences(reminders, today, horizonEnd)) {
        if (isPaid(o, txns, paidKeys)) continue
        val r = o.reminder
        // A card-bill reminder with no amount repeats the card bills below.
        if ((r.amount ?: 0.0) <= 0.0 && r.title.contains("card", ignoreCase = true) && statements.any { it.summary.billDue > 0 }) continue
        raw += ForecastEvent(
            on = o.on,
            label = r.title,
            amount = -(r.amount ?: 0.0),
            kind = EventKind.REMINDER,
            unknown = (r.amount ?: 0.0) <= 0.0,
            reminderId = r.id,
        )
    }

    for (s in statements) {
        val due = s.dueOn ?: continue
        if (s.summary.billDue > 0 && !due.isBefore(today) && !due.isAfter(horizonEnd)) {
            raw += ForecastEvent(due, s.name + " bill", -s.summary.billDue, EventKind.CARD, statementAccountId = s.summary.accountId)
        }
    }

    if (salary.amount > 0 && !salary.receivedThisMonth) {
        val ym = YearMonth.from(today)
        val landing = ym.atDay(min(salary.dayOfMonth, ym.lengthOfMonth()))
        val on = if (landing.isBefore(today)) ym.plusMonths(1).atDay(min(salary.dayOfMonth, 28)) else landing
        if (!on.isAfter(horizonEnd)) raw += ForecastEvent(on, "Salary (expected)", salary.amount, EventKind.INCOME)
    }

    raw.sortWith(compareBy<ForecastEvent> { it.on }.thenByDescending { it.amount })

    var running = balance
    var minBalance = balance
    var minOn = today
    val events = mutableListOf(ForecastEvent(today, "Today", 0.0, EventKind.START, balance))
    for (e in raw) {
        running += e.amount
        if (running < minBalance) {
            minBalance = running
            minOn = e.on
        }
        events += e.copy(balanceAfter = running)
    }
    events += ForecastEvent(horizonEnd, "Projected balance", 0.0, EventKind.END, running)

    val committed = raw.filter { it.amount < 0 && !it.on.isAfter(monthEnd) }.sumOf { -it.amount }
    val income = raw.filter { it.amount > 0 && !it.on.isAfter(monthEnd) }.sumOf { it.amount }
    return Forecast(
        today = today,
        startBalance = balance,
        events = events,
        projected = running,
        projectedOn = horizonEnd,
        minBalance = minBalance,
        minOn = minOn,
        reserve = reserve,
        salary = salary,
        committedThisMonth = committed,
        incomeThisMonth = income,
        safeToSpend = max(0.0, balance + income - committed - reserve),
    )
}

/** Days from today, never negative. */
fun daysUntil(on: LocalDate, today: LocalDate = LocalDate.now()): Long = ChronoUnit.DAYS.between(today, on)
