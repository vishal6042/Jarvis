package com.jarvis.sync.finance

import com.jarvis.sync.data.CardSummaryDto
import com.jarvis.sync.data.EnrichedMerchantDto
import com.jarvis.sync.data.GoalDto
import com.jarvis.sync.data.InvestmentDto
import com.jarvis.sync.data.LoanDto
import com.jarvis.sync.data.ReminderDto
import com.jarvis.sync.data.TransactionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class FinanceTest {

    private val today = LocalDate.of(2026, 9, 30)
    private val bank = 1L
    private val card = 2L
    private val cards = setOf(card)
    private var nextId = 1L

    private fun txn(
        on: LocalDate,
        amount: Double,
        direction: String = "DEBIT",
        account: Long? = bank,
        category: String? = "Food",
        merchant: String? = "SHOP",
        transfer: Boolean = false,
        settlement: Boolean = false,
    ) = TransactionDto(
        id = nextId++,
        accountId = account,
        amount = amount,
        direction = direction,
        merchant = merchant,
        category = category,
        // Noon local time, so the day never shifts across the zone.
        occurredAt = on.atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toString(),
        transfer = transfer,
        settlement = settlement,
    )

    private fun salaries() = listOf(
        txn(LocalDate.of(2026, 6, 30), 370_000.0, "CREDIT", category = "Income"),
        txn(LocalDate.of(2026, 7, 31), 378_093.0, "CREDIT", category = "Income"),
        txn(LocalDate.of(2026, 8, 29), 378_093.0, "CREDIT", category = "Income"),
    )

    @Test
    fun salary_is_the_median_of_the_last_three_months() {
        val s = inferSalary(salaries(), cards, today)
        assertEquals(378_093.0, s.amount, 0.5)
        assertEquals(30, s.dayOfMonth)
        assertEquals(3, s.basis)
        assertFalse(s.receivedThisMonth)
    }

    @Test
    fun a_refund_on_a_card_is_not_salary() {
        val rows = listOf(txn(LocalDate.of(2026, 8, 10), 900_000.0, "CREDIT", account = card)) + salaries()
        assertEquals(378_093.0, inferSalary(rows, cards, today).amount, 0.5)
    }

    @Test
    fun no_salary_is_predicted_for_someone_without_an_income() {
        assertEquals(0, inferSalary(salaries(), cards, today, earns = false).basis)
    }

    @Test
    fun spend_counts_purchases_takes_off_card_refunds_and_ignores_own_moves() {
        assertEquals(500.0, spendOf(txn(today, 500.0), cards), 0.0)
        assertEquals(-200.0, spendOf(txn(today, 200.0, "CREDIT", account = card), cards), 0.0)
        assertEquals(0.0, spendOf(txn(today, 50_000.0, transfer = true), cards), 0.0)
        assertEquals(0.0, spendOf(txn(today, 49_675.0, settlement = true), cards), 0.0)
        assertEquals(0.0, spendOf(txn(today, 300.0, "CREDIT"), cards), 0.0)
    }

    @Test
    fun forecast_adds_the_salary_takes_the_bills_and_finds_the_low() {
        val bill = CardSummaryDto(accountId = card, displayName = "Amazon Pay ICICI", billDue = 191_607.0, dueOn = "2026-10-05")
        val rent = ReminderDto(id = 7, title = "Rent", date = "2026-07-02", amount = 20_000.0, repeat = "monthly")
        val f = buildForecast(
            balance = 1_170_000.0, txns = salaries(), reminders = listOf(rent), cards = listOf(bill),
            cardIds = cards, reserve = 500_000.0, paidKeys = emptySet(), today = today,
        )
        val kinds = f.within(30).map { it.kind }
        assertTrue(EventKind.INCOME in kinds)
        assertTrue(EventKind.CARD in kinds)
        assertEquals("Salary lands today", today, f.within(30).first { it.kind == EventKind.INCOME }.on)
        assertEquals(1_170_000.0 + 378_093.0 - 20_000.0 * 1 - 191_607.0, f.projected, 1.0)
        assertTrue(f.healthy)
        // This month: salary in today, nothing else due before 1 October.
        assertEquals(1_170_000.0 + 378_093.0 - 500_000.0, f.safeToSpend, 1.0)
    }

    @Test
    fun a_reminder_paid_by_a_matching_debit_drops_out() {
        val rent = ReminderDto(id = 7, title = "Rent", date = "2026-10-02", amount = 20_000.0)
        val paid = txn(LocalDate.of(2026, 9, 29), 20_100.0) // within 2%, three days early
        val f = buildForecast(0.0, listOf(paid), listOf(rent), emptyList(), cards, 0.0, emptySet(), today = today)
        assertTrue(f.within(30).none { it.reminderId == 7L })
    }

    @Test
    fun cards_on_one_statement_are_one_bill_with_their_unbilled_summed() {
        val a = CardSummaryDto(accountId = 3, displayName = "Amex", bank = "ICICI", billingGroup = "icici", billDue = 49_675.0, unbilled = 1_486.0)
        val b = CardSummaryDto(accountId = 4, displayName = "MC", bank = "ICICI", billingGroup = "icici", billDue = 49_675.0, unbilled = 16_090.0)
        val c = CardSummaryDto(accountId = 5, displayName = "Amazon Pay ICICI", billDue = 191_607.0)
        val s = statementsOf(listOf(a, b, c))
        assertEquals(2, s.size)
        assertEquals("ICICI · one statement", s[0].name)
        assertEquals(17_576.0, s[0].summary.unbilled, 0.0)
        assertEquals(listOf(3L, 4L), s[0].accountIds)
    }

    @Test
    fun compact_amounts_read_to_three_figures() {
        assertEquals("₹79.8L", lakh(7_980_000.0))
        assertEquals("₹2.13L", lakh(213_000.0))
        assertEquals("₹20K", lakh(20_000.0))
        assertEquals("₹4.1Cr", lakh(41_000_000.0))
        assertEquals("₹1,91,607", rupees(191_607.0))
        assertEquals("−₹500", rupees(-500.0))
    }

    @Test
    fun a_loan_runs_down_to_zero_and_its_interest_falls() {
        val loan = LoanDto(id = 1, kind = "HOME", lender = "SBI", sanctioned = 5_000_000.0, outstanding = 425_314.0, emi = 68_339.0, rate = 7.15)
        val s = loanSchedule(loan, today)
        assertEquals(7, s.size)
        assertEquals(0.0, s.last().balanceAfter, 1.0)
        assertTrue(s.first().interest > s[s.size - 2].interest)
        assertEquals(java.time.YearMonth.of(2026, 10), s.first().month)
    }

    @Test
    fun an_emi_below_the_interest_never_clears() {
        val loan = LoanDto(id = 1, kind = "HOME", lender = "X", outstanding = 1_000_000.0, emi = 1_000.0, rate = 12.0)
        assertTrue(loanSchedule(loan, today).isEmpty())
    }

    @Test
    fun an_off_pace_goal_gets_a_plan_that_uses_the_deposits() {
        val goal = GoalDto(id = 1, name = "Car", targetAmount = 2_000_000.0, savedAmount = 0.0, targetDate = "2027-06-30")
        val keep = 109_000.0
        val read = readGoal(goal, keep, today)
        assertEquals(GoalState.OFF_PACE, read.state)
        val fd = InvestmentDto(
            id = 9, kind = "FD", name = "FD", principal = 1_000_000.0, current = 1_000_000.0,
            rate = 7.2, openingDate = "2024-08-15", maturityDate = "2027-08-15",
        )
        val plan = fundedPlan(read, keep, payouts(listOf(fd), today), today)
        assertNotNull(plan)
        plan!!
        assertFalse("June is before the FD pays out, so the date moves", plan.keepsDate)
        assertTrue(plan.monthly <= keep * PLAN_SHARE)
        assertTrue(plan.payoutTotal > 1_000_000.0)
        assertEquals("your FD", plan.noun)
    }

    @Test
    fun an_rd_matures_to_more_than_went_in() {
        assertTrue(rdValue(5_000.0, 60, 6.7) > 300_000.0)
        assertEquals(300_000.0, rdValue(5_000.0, 60, 0.0), 0.0)
    }

    @Test
    fun the_review_queue_finds_people_loose_rows_and_wrong_categories() {
        val person = txn(today, 165.0, category = "Transfers", merchant = "MOHAMMED RAFEEQ")
        val loose = txn(today, 145.0, category = "Uncategorized", merchant = "INNOVATIV")
        val pvr = txn(today, 1_407.0, category = "Food", merchant = "PVR LIMITED")
        val suggestions = mapOf(
            "pvr limited" to EnrichedMerchantDto("PVR LIMITED", "PVR", "Entertainment", 0.9, "PVR is a cinema chain"),
            "innovativ" to EnrichedMerchantDto("INNOVATIV", "Innovativ", "Groceries", 0.85, null),
        )
        val q = buildQueue(listOf(person, loose, pvr), suggestions, emptySet())
        assertEquals(listOf(person.id), q.people.map { it.id })
        assertEquals("Groceries", q.loose.single().suggested)
        assertEquals("Entertainment", q.wrong.single().to)
        assertEquals(3, q.count)
        assertEquals(2, q.confident.size)

        val dismissed = buildQueue(listOf(person, loose, pvr), suggestions, setOf("person:${person.id}", q.wrong.single().key))
        assertEquals(1, dismissed.count)
    }

    @Test
    fun an_sms_retried_successfully_counts_as_saved_and_a_repeat_is_noted() {
        val failedThenSaved = readSms(
            listOf(Verdict("FAILED", "Missing amount", 10, null), Verdict("PARSED", null, 10, 99)),
            inFlight = false,
        )
        assertEquals(SmsOutcome.SAVED, failedThenSaved.outcome)
        assertEquals(99L, failedThenSaved.verdict?.transactionId)

        val twice = readSms(listOf(Verdict("PARSED", null, 1, 5), Verdict("DUPLICATE", null, 2, 5)), false)
        assertEquals(SmsOutcome.SAVED, twice.outcome)
        assertTrue(twice.alsoTwice)

        assertEquals(SmsOutcome.TWICE, readSms(listOf(Verdict("DUPLICATE", null, 2, 5)), false).outcome)
        assertEquals(SmsOutcome.WAITING, readSms(emptyList(), true).outcome)
        assertNull(readSms(emptyList(), false).verdict)
    }
}
