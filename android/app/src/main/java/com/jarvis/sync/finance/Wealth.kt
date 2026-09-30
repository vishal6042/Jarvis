package com.jarvis.sync.finance

import com.jarvis.sync.data.GoalDto
import com.jarvis.sync.data.InvestmentDto
import com.jarvis.sync.data.LoanDto
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

/*
 * The Wealth tab's arithmetic, ported from the web app (lib/rdMath.ts, lib/portfolio.ts,
 * components/goals/plan.ts): what each deposit pays out and when, how the holdings split, where
 * each goal stands against what the household keeps, and a loan's remaining payments.
 */

// ---------------------------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------------------------

private fun date(s: String?): LocalDate? = s?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

/** Whole months from one date to another, not counting a month not yet completed. */
fun monthsBetween(a: LocalDate, b: LocalDate): Int =
    max(0, (b.year - a.year) * 12 + (b.monthValue - a.monthValue) + if (b.dayOfMonth >= a.dayOfMonth) 0 else -1)

/** A recurring deposit's value: fixed instalments, interest compounded quarterly (India Post). */
fun rdValue(instalment: Double, months: Int, ratePct: Double): Double {
    if (instalment <= 0 || months <= 0) return 0.0
    val deposits = instalment * months
    if (ratePct <= 0) return deposits
    val i = ratePct / 400
    val n = months / 3.0
    val factor = ((1 + i).pow(n) - 1) / (1 - (1 + i).pow(-1.0 / 3))
    return max(deposits, instalment * factor)
}

/** A fixed deposit compounded quarterly. */
fun fdValue(principal: Double, years: Double, ratePct: Double): Double =
    if (principal <= 0 || years <= 0) principal else principal * (1 + ratePct / 400).pow(4 * years)

/**
 * What a holding pays out when it matures, from its own terms; null when the terms do not say (an
 * LIC policy's bonuses) or when the "maturity" is a projection rather than a payout (EPF at 58).
 */
fun maturityValue(inv: InvestmentDto, today: LocalDate = LocalDate.now()): Double? {
    if (inv.kind == "PF") return null
    val maturity = date(inv.maturityDate) ?: return null
    val rate = inv.rate ?: 0.0
    val start = date(inv.commencementDate) ?: date(inv.openingDate)
    val sip = inv.sip ?: 0.0
    if (start != null) {
        val total = monthsBetween(start, maturity)
        if (total > 0) {
            if (inv.kind == "RD" && sip > 0) return rdValue(sip, total, rate)
            if (inv.kind in setOf("FD", "NSC", "KVP") && inv.principal > 0 && rate > 0) return fdValue(inv.principal, total / 12.0, rate)
        }
    }
    if (inv.kind == "RD" && sip > 0 && rate > 0) {
        val done = (inv.principal / sip).roundToInt()
        return rdValue(sip, done + monthsBetween(today, maturity), rate)
    }
    return null
}

/** Money freeing up: a holding that matures, what it pays (or is worth now, when [estimated]). */
data class Payout(val inv: InvestmentDto, val on: LocalDate, val amount: Double, val estimated: Boolean)

/** Every holding still to mature, soonest first. EPF is left out: it is locked until retirement. */
fun payouts(investments: List<InvestmentDto>, today: LocalDate = LocalDate.now()): List<Payout> =
    investments.mapNotNull { inv ->
        if (inv.kind == "PF") return@mapNotNull null
        val on = date(inv.maturityDate) ?: return@mapNotNull null
        if (on.isBefore(today)) return@mapNotNull null
        val v = maturityValue(inv, today)
        Payout(inv, on, v ?: inv.current, v == null)
    }.sortedBy { it.on }

/** Payouts that land in the same month, as one row of the "when money frees up" ladder. */
data class PayoutMonth(val month: YearMonth, val amount: Double, val items: List<Payout>) {
    val estimated: Boolean get() = items.any { it.estimated }
}

fun payoutLadder(payouts: List<Payout>): List<PayoutMonth> =
    payouts.groupBy { YearMonth.from(it.on) }.map { (m, ps) -> PayoutMonth(m, ps.sumOf { it.amount }, ps) }.sortedBy { it.month }

// ---------------------------------------------------------------------------------------------
// The mix
// ---------------------------------------------------------------------------------------------

/** A row of the holdings list: one kind of product, however many of them. */
data class HoldingGroup(val kind: String, val label: String, val items: List<InvestmentDto>) {
    val value: Double get() = items.sumOf { it.current }
    val count: Int get() = items.size
    val rates: List<Double> get() = items.mapNotNull { it.rate }.filter { it > 0 }
}

/** Products whose value moves with the market; everything else pays a fixed or declared rate. */
val MARKET_KINDS = setOf("NPS", "MF", "SIP", "STOCK", "STOCKS", "EQUITY", "ETF", "GOLD", "CRYPTO")

fun kindLabel(kind: String, plural: Boolean): String = when (kind.uppercase()) {
    "PF", "EPF" -> "EPF"
    "LIC" -> "LIC"
    "FD" -> if (plural) "Fixed deposits" else "Fixed deposit"
    "RD" -> if (plural) "Recurring deposits" else "Recurring deposit"
    "NPS" -> "NPS"
    "PPF" -> "PPF"
    "MF", "SIP" -> "Mutual funds"
    "STOCK", "STOCKS", "EQUITY" -> "Shares"
    "GOLD" -> "Gold"
    else -> kind.lowercase().replaceFirstChar { it.uppercase() }
}

fun holdingGroups(investments: List<InvestmentDto>): List<HoldingGroup> =
    investments.groupBy { it.kind.uppercase() }
        .map { (k, items) -> HoldingGroup(k, kindLabel(k, items.size > 1), items) }
        .sortedByDescending { it.value }

/** What goes in each month: instalments and SIPs, yearly premiums spread over the year. */
fun monthlyIn(investments: List<InvestmentDto>): Double =
    investments.sumOf { i -> (i.sip ?: 0.0).let { if (i.contributionFrequency == "yearly") it / 12 else it } }

/** Jarvis's one-line read of the mix, or null when there is nothing worth saying. */
fun mixTake(investments: List<InvestmentDto>): Pair<String, String>? {
    val total = investments.sumOf { it.current }
    if (total <= 0) return null
    val market = investments.filter { it.kind.uppercase() in MARKET_KINDS }.sumOf { it.current }
    val fixedPct = ((total - market) / total * 100).roundToInt()
    val epf = investments.filter { it.kind == "PF" }
    val epfShare = (epf.sumOf { it.current } / total * 100).roundToInt()
    val epfUntil = epf.mapNotNull { date(it.maturityDate) }.maxOrNull()
    val marketNames = investments.filter { it.kind.uppercase() in MARKET_KINDS }.map { kindLabel(it.kind, false) }.distinct()
    val head = "$fixedPct% is in fixed-return products"
    val tail = buildString {
        if (epfShare >= 25 && epfUntil != null) append(", and EPF alone ($epfShare%) is locked until ${epfUntil.year}.")
        else append(".")
        when {
            marketNames.isEmpty() -> append(" Nothing moves with the market.")
            marketNames.size == 1 -> append(" Only ${marketNames[0]} moves with the market.")
            else -> append(" ${marketNames.joinToString(" and ")} move with the market.")
        }
    }
    return head to tail
}

// ---------------------------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------------------------

enum class GoalState { REACHED, ON_TRACK, OFF_PACE, UNDATED }

data class GoalRead(
    val goal: GoalDto,
    val remaining: Double,
    val pct: Float,
    val state: GoalState,
    /** Months to the target date, null when undated or already past. */
    val months: Int?,
    val overdue: Boolean,
    /** What reaching the date takes each month. */
    val needed: Double?,
    /** When it is reached if everything kept goes to it; null without a positive pace. */
    val eta: LocalDate?,
)

/** Calendar months from this month to the target's; the current month no longer counts. */
fun monthsUntil(target: LocalDate?, today: LocalDate = LocalDate.now()): Int? {
    target ?: return null
    val m = (target.year - today.year) * 12 + (target.monthValue - today.monthValue)
    return if (m <= 0) null else m
}

fun readGoal(goal: GoalDto, keep: Double, today: LocalDate = LocalDate.now()): GoalRead {
    val remaining = max(0.0, goal.targetAmount - goal.savedAmount)
    val pct = if (goal.targetAmount > 0) (goal.savedAmount / goal.targetAmount).toFloat().coerceIn(0f, 1f) else 0f
    val target = date(goal.targetDate)
    val months = monthsUntil(target, today)
    val overdue = target != null && months == null && remaining > 0
    val needed = if (months != null && remaining > 0) ceil(remaining / months) else null
    val eta = if (remaining > 0 && keep > 0) {
        val m = ceil(remaining / keep).toLong()
        YearMonth.from(today).plusMonths(m).atEndOfMonth()
    } else null
    val state = when {
        remaining <= 0 -> GoalState.REACHED
        target == null -> GoalState.UNDATED
        overdue || keep <= 0 || (needed ?: 0.0) > keep -> GoalState.OFF_PACE
        else -> GoalState.ON_TRACK
    }
    return GoalRead(goal, remaining, pct, state, months, overdue, needed, eta)
}

/** Share of what is kept that a plan may commit; the rest stays free for an expensive month. */
const val PLAN_SHARE = 0.8

data class FundedPlan(
    /** Set aside each month, rounded up to a figure a person would type (0 when payouts cover it). */
    val monthly: Double,
    val months: Int,
    val by: LocalDate,
    val keepsDate: Boolean,
    val used: List<Payout>,
    val payoutTotal: Double,
) {
    /** "your 5 FDs", "your FD and 2 RDs". */
    val noun: String get() {
        val fd = used.count { it.inv.kind == "FD" }
        val rd = used.count { it.inv.kind == "RD" }
        val other = used.size - fd - rd
        fun part(n: Int, k: String) = when (n) { 0 -> null; 1 -> k; else -> "$n ${k}s" }
        return "your " + listOfNotNull(part(fd, "FD"), part(rd, "RD"), part(other, "deposit")).joinToString(" and ")
    }

    /** The note left on the goal when the plan is taken: "Funded by FD payouts, Aug 2027". */
    val note: String get() {
        val kinds = used.map { it.inv.kind }.distinct().sorted().joinToString(" and ")
        return "Funded by $kinds payouts, " + monthYear(used.last().on)
    }
}

private fun friendlyMonthly(x: Double, cap: Double): Double {
    if (x <= 0) return 0.0
    for (step in listOf(500.0, 100.0)) {
        val r = ceil(x / step) * step
        if (r <= cap) return r
    }
    return ceil(x)
}

/**
 * The recommended plan: the deposits maturing in time go to the goal, and at most [PLAN_SHARE] of
 * what is kept is set aside each month. The target date is kept when that works, else the first
 * month end that does. Null when there is no pace or no deposit that helps.
 */
fun fundedPlan(read: GoalRead, keep: Double, payouts: List<Payout>, today: LocalDate = LocalDate.now()): FundedPlan? {
    val deposits = payouts.filter { it.inv.kind in setOf("FD", "RD", "NSC", "KVP") && !it.estimated }
    if (read.remaining <= 0 || keep <= 0 || deposits.isEmpty()) return null
    val cap = keep * PLAN_SHARE
    fun at(months: Int, by: LocalDate, keepsDate: Boolean): FundedPlan? {
        val used = deposits.filter { !it.on.isAfter(by) }
        val total = used.sumOf { it.amount }
        val monthly = max(0.0, read.remaining - total) / months
        if (monthly > cap || used.isEmpty()) return null
        return FundedPlan(friendlyMonthly(monthly, cap), months, by, keepsDate, used, total)
    }
    val target = date(read.goal.targetDate)
    val toTarget = monthsUntil(target, today)
    if (target != null && toTarget != null) at(toTarget, target, true)?.let { return it }
    for (k in 1..600) {
        val by = YearMonth.from(today).plusMonths(k.toLong()).atEndOfMonth()
        val total = deposits.filter { !it.on.isAfter(by) }.sumOf { it.amount }
        if (max(0.0, read.remaining - total) / k <= cap) return at(k, by, false)
    }
    return null
}

/** The day a set-aside reminder falls on: the day after the salary lands, or the 1st. */
fun setAsideDay(salary: SalaryEstimate): Int {
    if (salary.basis == 0) return 1
    val d = salary.dayOfMonth + 1
    return if (d > 28) 1 else d
}

// ---------------------------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------------------------

data class LoanPayment(val month: YearMonth, val principal: Double, val interest: Double, val balanceAfter: Double)

/**
 * The payments still to make on a reducing-balance loan, from next month, until it is cleared.
 * Empty when the outstanding or the EMI is unknown. Without a rate the balance just runs down.
 */
fun loanSchedule(loan: LoanDto, today: LocalDate = LocalDate.now()): List<LoanPayment> {
    if (loan.outstanding <= 0 || loan.emi <= 0) return emptyList()
    val r = (loan.rate ?: 0.0) / 1200
    var balance = loan.outstanding
    var month = YearMonth.from(today).plusMonths(1)
    val out = mutableListOf<LoanPayment>()
    while (balance > 0.5 && out.size < 600) {
        val interest = balance * r
        if (loan.emi <= interest) return emptyList() // never clears at this EMI
        val principal = minOf(loan.emi - interest, balance)
        balance -= principal
        out += LoanPayment(month, principal, interest, max(0.0, balance))
        month = month.plusMonths(1)
    }
    return out
}

fun repaidShare(loan: LoanDto): Float? =
    if (loan.sanctioned > 0) (1 - loan.outstanding / loan.sanctioned).toFloat().coerceIn(0f, 1f) else null

fun loanLabel(loan: LoanDto): String {
    val kind = when (loan.kind.uppercase()) {
        "HOME" -> "home loan"
        "CAR", "AUTO", "VEHICLE" -> "car loan"
        "PERSONAL" -> "personal loan"
        "EDUCATION" -> "education loan"
        "GOLD" -> "gold loan"
        else -> "loan"
    }
    return loan.lender + " " + kind
}

/** Days from today to a date, for "in 10 days". */
fun daysTo(on: LocalDate, today: LocalDate = LocalDate.now()): Long = ChronoUnit.DAYS.between(today, on)
