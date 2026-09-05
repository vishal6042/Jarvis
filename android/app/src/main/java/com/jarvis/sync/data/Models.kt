package com.jarvis.sync.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** DTOs mirroring the Jarvis backend JSON. Unknown fields are ignored (see Json config in ApiClient). */

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class LoginResponse(
    val token: String,
    val username: String? = null,
    val expiresInMinutes: Int = 0,
)

@Serializable
data class IngestRequestDto(
    val source: String,
    val payload: String,
    val sender: String? = null,
    val receivedAt: String? = null, // ISO-8601 instant
)

@Serializable
data class IngestResponseDto(
    val rawMessageId: Long? = null,
    val status: String,
    val transactionId: Long? = null,
    val detail: String? = null,
)

@Serializable
data class PeriodSummaryDto(
    val earning: Double = 0.0,
    val spend: Double = 0.0,
)

@Serializable
data class AccountDto(
    val id: Long,
    /** Whose account this is; matches a MemberDto id. */
    val memberId: Long? = null,
    val type: String,
    val balance: Double? = null,
    @SerialName("displayName") val displayName: String? = null,
    val bank: String? = null,
    val last4: String? = null,
    val network: String? = null,
    val creditLimit: Double? = null,
)

/** Heartbeat sent to PUT /api/devices/{id} so the web app can show this phone under Settings. */
@Serializable
data class DeviceHeartbeatDto(
    val name: String,
    val manufacturer: String,
    val model: String,
    val osVersion: String,
    val appVersion: String,
    val forwardingEnabled: Boolean,
    val pendingCount: Int,
    val forwardedTotal: Long,
    val lastSyncAt: String? = null,
)

@Serializable
data class TransactionDto(
    val id: Long,
    val accountId: Long? = null,
    val accountName: String? = null,
    val amount: Double,
    val currency: String = "INR",
    val direction: String,
    val merchant: String? = null,
    val merchantNorm: String? = null,
    val category: String? = null,
    val occurredAt: String,
    val source: String? = null,
    val note: String? = null,
    val transfer: Boolean = false,
    val settlement: Boolean = false, // one side of a credit-card bill payment
)

/** Manual entry (quick-add from the phone): mirrors expense-service CreateTransactionRequest. */
@Serializable
data class CreateTransactionDto(
    val accountId: Long? = null,
    val amount: Double,
    val currency: String = "INR",
    val direction: String,
    val merchant: String? = null,
    val category: String? = null,
    val occurredAt: String? = null,
    val note: String? = null,
)

@Serializable
data class ReminderDto(
    val id: Long,
    val title: String,
    val date: String,
    val type: String? = null,
    val amount: Double? = null,
    val repeat: String? = null,
)

@Serializable
data class InvestmentDto(
    val id: Long,
    val memberId: Long? = null,
    val kind: String,
    val name: String,
    val principal: Double = 0.0,
    val current: Double = 0.0,
    val sip: Double? = null,
    /** "monthly" (RD, SIP, EPF) or "yearly" (LIC premiums). */
    val contributionFrequency: String = "monthly",
    /** True for payslip deductions: the salary already arrives net of them. */
    val salaryDeducted: Boolean = false,
)

/** A person in the household; the phone filters by them the way the web app does. */
@Serializable
data class MemberDto(val id: Long, val name: String, val relation: String? = null)

@Serializable
data class LoanDto(
    val id: Long,
    val kind: String,
    val lender: String,
    val outstanding: Double = 0.0,
    val emi: Double = 0.0,
    val rate: Double? = null,
    val endDate: String? = null,
)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    val href: String? = null,
    val color: String? = null,
    val read: Boolean = false,
    val createdAt: String,
)

/** Inputs for the AI finance score — the same numbers the web dashboard sends. */
@Serializable
data class FinanceMetricsDto(
    val monthlyIncome: Double,
    val monthlySpend: Double,
    val savingsRate: Int,
    val cashSavings: Double,
    val investments: Double,
    val outstandingLoans: Double,
    val monthlyEmi: Double,
) {
    /** Cached scores are reused only while these inputs hold. */
    fun fingerprint(): String = listOf(
        monthlyIncome.toLong(), monthlySpend.toLong(), savingsRate, cashSavings.toLong(),
        investments.toLong(), outstandingLoans.toLong(), monthlyEmi.toLong(),
    ).joinToString("|")
}

@Serializable
data class FinanceScoreDto(
    val score: Int,
    val rating: String,
    val headline: String,
    val tips: List<String> = emptyList(),
)

/** Extra dashboard sections cached with the tiles so they render offline too. */
@Serializable
data class DashboardExtras(
    val members: List<MemberDto> = emptyList(),
    val upcoming: List<UpcomingItem> = emptyList(),
    val invested: Double = 0.0,
    val investmentValue: Double = 0.0,
    val loanOutstanding: Double = 0.0,
    val loanEmi: Double = 0.0,
    val loanEmisLeft: Int? = null,
    val recent: List<TransactionDto> = emptyList(),
    val accounts: List<AccountDto> = emptyList(),
    val lastMonthSpend: Double = 0.0,
    val score: FinanceScoreDto? = null,
    val scoreFingerprint: String? = null,
    val scoreAt: Long = 0L,
    val cards: List<CardSummaryDto> = emptyList(),
    /** Each investment, so the phone can show EPF, NPS and the deposits separately. */
    val holdings: List<InvestmentDto> = emptyList(),
    val paidOccurrences: List<String> = emptyList(),
)

@Serializable
data class UpcomingItem(
    val title: String,
    val on: String,
    val amount: Double? = null,
    val type: String? = null,
    /** The reminder this came from, so it can be marked paid from the phone. */
    val reminderId: Long? = null,
)

@Serializable
data class CategorySpendDto(
    val category: String,
    val total: Double,
)

// ---- Ask Jarvis ----
@Serializable
data class ChatRequestDto(val message: String, val context: String? = null)

@Serializable
data class ChatReplyDto(val answer: String)

/** One credit card's cycle, from expense-service /api/analytics/cards. */
@Serializable
data class CardSummaryDto(
    val accountId: Long,
    val displayName: String,
    val bank: String? = null,
    val last4: String? = null,
    val network: String? = null,
    val creditLimit: Double? = null,
    val dueOn: String? = null,
    val nextStatementOn: String? = null,
    val unbilled: Double = 0.0,
    val billed: Double = 0.0,
    val paid: Double = 0.0,
    val billDue: Double = 0.0,
    val lastPaidOn: String? = null,
    val lastPaidAmount: Double? = null,
    val utilisationPct: Int? = null,
    /** Set when this card shares one consolidated statement with others. */
    val billingGroup: String? = null,
)

/** A reminder occurrence the user marked paid. */
@Serializable
data class ReminderPaymentDto(
    val id: Long? = null,
    val reminderId: Long,
    val occurredOn: String,
    val paidOn: String? = null,
    val amount: Double? = null,
    val transactionId: Long? = null,
)

@Serializable
data class MarkPaidRequestDto(
    val occurredOn: String,
    val paidOn: String? = null,
    val amount: Double? = null,
    val transactionId: Long? = null,
)
