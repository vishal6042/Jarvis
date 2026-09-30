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
    /** Whether this account has authority over the whole household. */
    val admin: Boolean = true,
    /** The household member it speaks for; null for an administrator. */
    val memberId: Long? = null,
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
    /** Set when the merchant charged a foreign currency; [amount] is then the rupee equivalent. */
    val originalAmount: Double? = null,
    val originalCurrency: String? = null,
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
    /** The deposit's own terms, for what it pays out and when (null where they were never entered). */
    val rate: Double? = null,
    val openingDate: String? = null,
    val commencementDate: String? = null,
    val maturityDate: String? = null,
)

/** A person in the household; the phone filters by them the way the web app does. */
@Serializable
data class MemberDto(
    val id: Long,
    val name: String,
    val relation: String? = null,
    /** False for a member with no income of their own. Defaults true for an older server. */
    val earns: Boolean = true,
)

@Serializable
data class LoanDto(
    val id: Long,
    val memberId: Long? = null,
    val kind: String,
    val lender: String,
    val sanctioned: Double = 0.0,
    val outstanding: Double = 0.0,
    val emi: Double = 0.0,
    val rate: Double? = null,
    val tenureMonths: Int? = null,
    val startDate: String? = null,
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
    /** False scores this person on their buffer and spending rather than on income ratios. */
    val earnsIncome: Boolean = true,
    /** The month before [monthlySpend], for the no-income spending trend. */
    val previousMonthSpend: Double = 0.0,
) {
    /** Cached scores are reused only while these inputs hold. */
    fun fingerprint(): String = listOf(
        monthlyIncome.toLong(), monthlySpend.toLong(), savingsRate, cashSavings.toLong(),
        investments.toLong(), outstandingLoans.toLong(), monthlyEmi.toLong(),
        // The two rubrics read the same numbers differently, so a score from one must not be
        // reused for the other.
        earnsIncome, previousMonthSpend.toLong(),
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
    /**
     * Whether the signed-in member has an income of their own. False hides the earning figures
     * on the dashboard, which would otherwise all read zero.
     */
    val earns: Boolean = true,
    /**
     * The ledger behind the forecast, the brief and the month view: a few months of transactions,
     * cached so Home still draws its runway with the PC switched off.
     */
    val ledger: List<TransactionDto> = emptyList(),
    val reminders: List<ReminderDto> = emptyList(),
    val loans: List<LoanDto> = emptyList(),
    val goals: List<GoalDto> = emptyList(),
    /** Monthly budget per category. */
    val budgets: Map<String, Double> = emptyMap(),
    val recurring: List<RecurringDto> = emptyList(),
)

@Serializable
data class GoalDto(
    val id: Long,
    val name: String,
    val targetAmount: Double = 0.0,
    val savedAmount: Double = 0.0,
    val targetDate: String? = null,
    val color: String? = null,
    val notes: String? = null,
)

/** A goal as sent back on update (the server takes everything but the id). */
@Serializable
data class GoalPayloadDto(
    val name: String,
    val targetAmount: Double,
    val savedAmount: Double,
    val targetDate: String? = null,
    val color: String? = null,
    val notes: String? = null,
)

@Serializable
data class CreateReminderDto(
    val title: String,
    val date: String,
    val type: String,
    val amount: Double? = null,
    val notes: String? = null,
    val repeat: String? = null,
)

/** A payment the server has seen repeat on a cadence (a subscription, an SIP, rent). */
@Serializable
data class RecurringDto(
    val merchant: String? = null,
    val category: String? = null,
    val amount: Double = 0.0,
    val cadence: String = "Monthly",
    val lastPaid: String? = null,
    val nextExpected: String? = null,
    val occurrences: Int = 0,
)

// ---- the small AI helpers (ai-orchestrator AssistController / AiController) ----

@Serializable
data class AccountRefDto(val id: Long, val name: String)

@Serializable
data class FilterRequestDto(
    val query: String,
    val today: String,
    val categories: List<String>,
    val accounts: List<AccountRefDto>,
)

/** "food over ₹500 last week" understood as filters; every field null when the search did not ask. */
@Serializable
data class AiFilterDto(
    val category: String? = null,
    val direction: String? = null,
    val minAmount: Double? = null,
    val maxAmount: Double? = null,
    val from: String? = null,
    val to: String? = null,
    val accountId: Long? = null,
    val text: String? = null,
)

@Serializable
data class EnrichRequestDto(
    val merchants: List<String>,
    val categories: List<String>,
    val examples: List<String>,
)

/** The model's read of one raw merchant string: a clean name, its category, and why. */
@Serializable
data class EnrichedMerchantDto(
    val raw: String? = null,
    val merchant: String? = null,
    val category: String? = null,
    val confidence: Double? = null,
    val reason: String? = null,
)

@Serializable
data class ReceiptRequestDto(val image: String, val mimeType: String, val categories: List<String>)

/** A transaction read off a payment screenshot or a receipt, for the person to confirm. */
@Serializable
data class ReceiptDto(
    val amount: Double? = null,
    val merchant: String? = null,
    val occurredOn: String? = null,
    val direction: String = "DEBIT",
    val method: String? = null,
    val reference: String? = null,
    val category: String? = null,
    val confidence: Double = 0.0,
)

@Serializable
data class RuleRequestDto(val pattern: String, val category: String)

@Serializable
data class CardPaymentRequestDto(val accountId: Long, val amount: Double, val paidOn: String? = null)

@Serializable
data class RetryRequestDto(val ids: List<Long>)

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
data class ChatRequestDto(val message: String, val context: String? = null, val snapshot: SnapshotDto? = null)

/**
 * The forecast the phone already worked out, sent with a question so "how much can I spend"
 * gets the figure Home shows rather than one the model made up.
 */
@Serializable
data class SnapshotDto(
    val safeToSpend: Double,
    val reserve: Double,
    val savings: Double,
    val spentThisMonth: Double,
    val projected: Double,
    val projectedOn: String,
    val minBalance: Double,
    val minOn: String,
    val upcoming: List<SnapshotItemDto>,
)

@Serializable
data class SnapshotItemDto(val on: String, val label: String, val amount: Double, val estimate: Boolean)

@Serializable
data class ChatReplyDto(val answer: String, val visuals: List<VisualDto> = emptyList())

/** The figures behind an answer, as the tools produced them, so it can be drawn rather than read. */
@Serializable
data class VisualDto(
    val kind: String,
    val title: String,
    val subtitle: String? = null,
    val amount: Double? = null,
    val caption: String? = null,
    val tone: String? = null,
    val points: List<VisualPointDto> = emptyList(),
)

@Serializable
data class VisualPointDto(
    val label: String,
    val value: Double? = null,
    val of: Double? = null,
    val note: String? = null,
)

// ---- saved conversations (ai-orchestrator ChatHistoryController) ----

@Serializable
data class ChatSummaryDto(val id: Long, val title: String, val updatedAt: String, val messages: Long = 0)

@Serializable
data class ChatTurnDto(
    val id: Long,
    val role: String,
    val body: String,
    val visualsJson: String? = null,
    val at: String? = null,
)

@Serializable
data class ChatTranscriptDto(val id: Long, val title: String, val messages: List<ChatTurnDto> = emptyList())

@Serializable
data class TurnRequestDto(val role: String, val body: String, val visualsJson: String? = null)

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
