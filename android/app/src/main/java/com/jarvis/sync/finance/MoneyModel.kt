package com.jarvis.sync.finance

import com.jarvis.sync.data.AccountDto
import com.jarvis.sync.data.DashboardExtras
import com.jarvis.sync.data.EnrichedMerchantDto
import com.jarvis.sync.data.SnapshotDto
import com.jarvis.sync.data.SnapshotItemDto
import com.jarvis.sync.data.TransactionDto
import com.jarvis.sync.data.db.DashboardCache
import java.time.LocalDate
import java.time.YearMonth

/**
 * Everything the tabs show, worked out once from the cached dashboard. Home, Money, Ask, Wealth
 * and the morning notification all read this one object, so no two of them can tell a different
 * story about the same money.
 */
class MoneyModel(
    val cache: DashboardCache,
    val x: DashboardExtras,
    val reserve: Double,
    suggestions: Map<String, EnrichedMerchantDto> = emptyMap(),
    dismissed: Set<String> = emptySet(),
    val today: LocalDate = LocalDate.now(),
) {
    val accounts: List<AccountDto> = x.accounts
    val accountsById: Map<Long, AccountDto> = accounts.associateBy { it.id }
    val cardIds: Set<Long> = cardIdsOf(accounts)
    val ledger: List<TransactionDto> = x.ledger.ifEmpty { x.recent }
    val paidKeys: Set<String> = x.paidOccurrences.toSet()

    /** Savings balances: what the forecast starts from. */
    val cash: Double = cache.netWorth
    val invested: Double = x.investmentValue
    val owed: Double = x.loanOutstanding

    /** What is owned, as the web app reports it; the loan keeps its own figure beside it. */
    val netWorth: Double = cash + invested

    val forecast: Forecast = buildForecast(
        balance = cash,
        txns = ledger,
        reminders = x.reminders,
        cards = x.cards,
        cardIds = cardIds,
        reserve = reserve,
        paidKeys = paidKeys,
        earns = x.earns,
        today = today,
    )

    val statements: List<Statement> = statementsOf(x.cards)
    fun statementFor(accountId: Long): Statement? = statements.firstOrNull { accountId in it.accountIds }

    val thisMonth: YearMonth = YearMonth.from(today)
    fun rowsIn(ym: YearMonth): List<TransactionDto> = ledger.filter { inMonth(it, ym) }.sortedByDescending { it.occurredAt }
    val monthRows: List<TransactionDto> = rowsIn(thisMonth)

    /** This month's spending by category, by the shared spend rule, biggest first. */
    val byCategory: List<Pair<String, Double>> =
        spendByCategory(monthRows, cardIds).toList().sortedByDescending { it.second }

    /** The server's figure when it has one: it is the same figure the web dashboard shows. */
    val monthSpend: Double = if (cache.monthSpend > 0) cache.monthSpend else byCategory.sumOf { it.second }
    val spentToday: Double = monthRows.filter { it.day() == today }.sumOf { spendOf(it, cardIds) }

    /** Last month to the same day, for "▼ 56% vs Aug": a month-to-date against a whole month misleads. */
    val lastMonthToDate: Double = rowsIn(thisMonth.minusMonths(1))
        .filter { it.day().dayOfMonth <= today.dayOfMonth }
        .sumOf { spendOf(it, cardIds) }
    val monthToDate: Double = monthRows.sumOf { spendOf(it, cardIds) }

    val budgets: List<BudgetRead> = budgetReads(byCategory.toMap(), x.budgets)

    val brief: List<BriefCell> = briefCells(forecast, ledger, cardIds, budgets, x.earns, today)

    val keep: Pair<Double, Int> = monthlyKeep(ledger, cardIds, today)
    val payouts: List<Payout> = payouts(x.holdings, today)
    val goals: List<GoalRead> = x.goals.map { readGoal(it, keep.first, today) }

    val queue: ReviewQueue = buildQueue(monthRows, suggestions, dismissed)

    val overdue: List<Occurrence> = overdueOccurrences(x.reminders, ledger, paidKeys, today)
    val paidThisMonth: Pair<Int, Int> = paidThisMonth(x.reminders, ledger, paidKeys, today)

    fun actions(failedSms: Int): List<NextAction> = nextActions(
        statements = statements,
        budgets = budgets,
        reviewCount = queue.count,
        unreadSms = failedSms,
        overdue = overdue,
        offPace = goals.filter { it.state == GoalState.OFF_PACE },
        today = today,
    )

    /** The forecast as figures, sent with a question so the answer uses them. */
    fun snapshot(): SnapshotDto = SnapshotDto(
        safeToSpend = forecast.safeToSpend,
        reserve = reserve,
        savings = cash,
        spentThisMonth = monthSpend,
        projected = forecast.projected,
        projectedOn = forecast.projectedOn.toString(),
        minBalance = forecast.minBalance,
        minOn = forecast.minOn.toString(),
        upcoming = forecast.within(30).map {
            SnapshotItemDto(it.on.toString(), it.label, -it.amount, estimate = it.kind == EventKind.INCOME || it.unknown)
        },
    )

    /** The forecast as prose, for background the agent's tools do not cover. */
    fun context(): String = buildString {
        append("Today is ").append(today).append(". ")
        append("Savings balance ").append(rupees(cash)).append(", invested ").append(rupees(invested))
        if (owed > 0) append(", loans outstanding ").append(rupees(owed))
        append(". Spent this month ").append(rupees(monthSpend)).append(". ")
        append("Safe to spend until month end ").append(rupees(forecast.safeToSpend))
            .append(" after a reserve of ").append(rupees(reserve)).append(". ")
        val next = forecast.within(14)
        if (next.isNotEmpty()) {
            append("Next 14 days: ")
            append(next.joinToString("; ") { e -> e.label + " " + dayMonth(e.on) + (if (e.unknown) "" else " " + rupees(e.amount)) })
            append(".")
        }
    }
}
