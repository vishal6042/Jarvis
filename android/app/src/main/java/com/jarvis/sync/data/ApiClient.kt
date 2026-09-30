package com.jarvis.sync.data

import okhttp3.Call

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** Typed failures the repository reacts to (401 → re-login; other codes → decide keep vs. drop). */
sealed class ApiException(message: String) : Exception(message) {
    data object Unauthorized : ApiException("Unauthorized (401)")
    data class Http(val code: Int) : ApiException("HTTP $code")
}

/**
 * Thin OkHttp client for the Jarvis gateway. All calls run on Dispatchers.IO and either return the
 * parsed body, or throw: IOException (transport — retry), ApiException.Unauthorized (401 — re-login),
 * or ApiException.Http (other non-2xx). Base URL + Bearer token are passed in per call (they live in
 * the DB session), so this client is stateless.
 */
class ApiClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /** The local model can think for a couple of minutes; only the agent calls use this. */
    private val slowClient = client.newBuilder().readTimeout(4, TimeUnit.MINUTES).build()

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun login(baseUrl: String, username: String, password: String): LoginResponse =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(LoginRequest(username, password)).toRequestBody(jsonMedia)
            val req = Request.Builder().url(url(baseUrl, "/api/auth/login")).post(body).build()
            client.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) throw ApiException.Http(resp.code)
                json.decodeFromString<LoginResponse>(text)
            }
        }

    suspend fun ingest(baseUrl: String, token: String, req: IngestRequestDto): IngestResponseDto =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(req).toRequestBody(jsonMedia)
            val request = Request.Builder()
                .url(url(baseUrl, "/api/ingest"))
                .header("Authorization", "Bearer $token")
                .post(body)
                .build()
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                when {
                    resp.isSuccessful -> json.decodeFromString<IngestResponseDto>(text)
                    resp.code == 401 -> throw ApiException.Unauthorized
                    else -> throw ApiException.Http(resp.code)
                }
            }
        }

    suspend fun summary(baseUrl: String, token: String, from: String, to: String): PeriodSummaryDto =
        getJson(baseUrl, token, "/api/analytics/summary", mapOf("from" to from, "to" to to))

    suspend fun members(baseUrl: String, token: String): List<MemberDto> =
        getJson(baseUrl, token, "/api/members", emptyMap())

    suspend fun accounts(baseUrl: String, token: String): List<AccountDto> =
        getJson(baseUrl, token, "/api/accounts", emptyMap())

    suspend fun byCategory(baseUrl: String, token: String, from: String, to: String): List<CategorySpendDto> =
        getJson(baseUrl, token, "/api/analytics/by-category", mapOf("from" to from, "to" to to))

    suspend fun recentTransactions(baseUrl: String, token: String, size: Int = 10): List<TransactionDto> =
        getJson(baseUrl, token, "/api/transactions", mapOf("page" to "0", "size" to size.toString()))

    /** Ask the local agent a question; it can take a while, so this call has its own long timeout. */
    suspend fun chat(baseUrl: String, token: String, req: ChatRequestDto): ChatReplyDto =
        postJson(baseUrl, token, "/api/ai/chat", json.encodeToString(req), longCall = true)

    // ---- saved conversations ----
    suspend fun chats(baseUrl: String, token: String): List<ChatSummaryDto> =
        getJson(baseUrl, token, "/api/ai/chats", emptyMap())

    suspend fun startChat(baseUrl: String, token: String): ChatSummaryDto =
        postJson(baseUrl, token, "/api/ai/chats", "{}")

    suspend fun chatTranscript(baseUrl: String, token: String, id: Long): ChatTranscriptDto =
        getJson(baseUrl, token, "/api/ai/chats/$id", emptyMap())

    suspend fun appendTurn(baseUrl: String, token: String, id: Long, turn: TurnRequestDto) {
        postJson<Unit>(baseUrl, token, "/api/ai/chats/$id/messages", json.encodeToString(turn), decode = false)
    }

    // ---- the small AI helpers; all run on the local model, so all get the long timeout ----
    suspend fun aiFilter(baseUrl: String, token: String, req: FilterRequestDto): AiFilterDto =
        postJson(baseUrl, token, "/api/ai/filter", json.encodeToString(req), longCall = true)

    suspend fun aiMerchants(baseUrl: String, token: String, req: EnrichRequestDto): List<EnrichedMerchantDto> =
        postJson(baseUrl, token, "/api/ai/merchants", json.encodeToString(req), longCall = true)

    suspend fun aiReceipt(baseUrl: String, token: String, req: ReceiptRequestDto): ReceiptDto =
        postJson(baseUrl, token, "/api/ai/receipt", json.encodeToString(req), longCall = true)

    // ---- rules, card bills, goals, reminders, budgets ----
    suspend fun createRule(baseUrl: String, token: String, req: RuleRequestDto) {
        postJson<Unit>(baseUrl, token, "/api/rules", json.encodeToString(req), decode = false)
    }

    /** Mark a card bill paid by hand; the bank's alert later confirms it instead of adding a second. */
    suspend fun markCardPaid(baseUrl: String, token: String, req: CardPaymentRequestDto): TransactionDto =
        postJson(baseUrl, token, "/api/transactions/card-payment", json.encodeToString(req))

    suspend fun undoCardPaid(baseUrl: String, token: String, transactionId: Long) =
        send(baseUrl, token, "/api/transactions/card-payment/$transactionId", "DELETE", null)

    suspend fun goals(baseUrl: String, token: String): List<GoalDto> =
        getJson(baseUrl, token, "/api/goals", emptyMap())

    suspend fun updateGoal(baseUrl: String, token: String, id: Long, goal: GoalPayloadDto) =
        send(baseUrl, token, "/api/goals/$id", "PUT", json.encodeToString(goal))

    suspend fun createReminder(baseUrl: String, token: String, req: CreateReminderDto) {
        postJson<Unit>(baseUrl, token, "/api/reminders", json.encodeToString(req), decode = false)
    }

    suspend fun thresholds(baseUrl: String, token: String): Map<String, Double> =
        getJson(baseUrl, token, "/api/thresholds", emptyMap())

    suspend fun recurring(baseUrl: String, token: String): List<RecurringDto> =
        getJson(baseUrl, token, "/api/recurring", emptyMap())

    /** Re-read alerts the server could not, in place. Returns what each became. */
    suspend fun retryIngest(baseUrl: String, token: String, ids: List<Long>): List<IngestResponseDto> =
        postJson(baseUrl, token, "/api/ingest/retry", json.encodeToString(RetryRequestDto(ids)), longCall = true)

    /** Whether a Jarvis gateway answers at this address — for the sign-in screen's "found" line. */
    suspend fun reachable(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url(baseUrl, "/actuator/health")).get().build()
            client.newBuilder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
                .newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    /** A call whose answer is not needed: PUT or DELETE, success or a typed failure. */
    private suspend fun send(baseUrl: String, token: String, path: String, method: String, body: String?) {
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(url(baseUrl, path))
                .header("Authorization", "Bearer $token")
                .method(method, body?.toRequestBody(jsonMedia))
                .build()
            client.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> Unit
                    resp.code == 401 -> throw ApiException.Unauthorized
                    else -> throw ApiException.Http(resp.code)
                }
            }
        }
    }

    suspend fun cards(baseUrl: String, token: String): List<CardSummaryDto> =
        getJson(baseUrl, token, "/api/analytics/cards", emptyMap())

    suspend fun transactions(baseUrl: String, token: String, size: Int): List<TransactionDto> =
        getJson(baseUrl, token, "/api/transactions", mapOf("page" to "0", "size" to size.toString()))

    /** Inline category change from the phone. */
    suspend fun setCategory(baseUrl: String, token: String, id: Long, category: String): TransactionDto =
        patchJson(baseUrl, token, "/api/transactions/$id/category", "{\"category\":\"" + category.replace("\"", "") + "\"}")

    suspend fun reminderPayments(baseUrl: String, token: String): List<ReminderPaymentDto> =
        getJson(baseUrl, token, "/api/reminders/payments", emptyMap())

    suspend fun markReminderPaid(baseUrl: String, token: String, reminderId: Long, req: MarkPaidRequestDto): ReminderPaymentDto =
        postJson(baseUrl, token, "/api/reminders/$reminderId/payments", json.encodeToString(req))

    suspend fun reminders(baseUrl: String, token: String): List<ReminderDto> =
        getJson(baseUrl, token, "/api/reminders", emptyMap())

    suspend fun investments(baseUrl: String, token: String): List<InvestmentDto> =
        getJson(baseUrl, token, "/api/investments", emptyMap())

    suspend fun loans(baseUrl: String, token: String): List<LoanDto> =
        getJson(baseUrl, token, "/api/loans", emptyMap())

    suspend fun notifications(baseUrl: String, token: String): List<NotificationDto> =
        getJson(baseUrl, token, "/api/notifications", emptyMap())

    /** AI-assessed finance score; the local model can take a while, so this call gets a long timeout. */
    suspend fun financeScore(baseUrl: String, token: String, metrics: FinanceMetricsDto): FinanceScoreDto =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(url(baseUrl, "/api/ai/finance-score"))
                .header("Authorization", "Bearer $token")
                .post(json.encodeToString(metrics).toRequestBody(jsonMedia))
                .build()
            client.newBuilder().readTimeout(120, TimeUnit.SECONDS).build().newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                when {
                    resp.isSuccessful -> json.decodeFromString<FinanceScoreDto>(text)
                    resp.code == 401 -> throw ApiException.Unauthorized
                    else -> throw ApiException.Http(resp.code)
                }
            }
        }

    suspend fun createTransaction(baseUrl: String, token: String, req: CreateTransactionDto): TransactionDto =
        postJson(baseUrl, token, "/api/transactions", json.encodeToString(req))

    suspend fun markAllNotificationsRead(baseUrl: String, token: String) {
        postJson<Unit>(baseUrl, token, "/api/notifications/read-all", "{}", decode = false)
    }

    suspend fun heartbeat(baseUrl: String, token: String, deviceId: String, hb: DeviceHeartbeatDto) {
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(url(baseUrl, "/api/devices/$deviceId"))
                .header("Authorization", "Bearer $token")
                .put(json.encodeToString(hb).toRequestBody(jsonMedia))
                .build()
            client.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> Unit
                    resp.code == 401 -> throw ApiException.Unauthorized
                    else -> throw ApiException.Http(resp.code)
                }
            }
        }
    }

    /** A long-lived call for the notifications SSE stream; read it with [readNotificationEvents]. */
    fun notificationStreamCall(baseUrl: String, token: String): Call {
        val request = Request.Builder()
            .url(url(baseUrl, "/api/notifications/stream"))
            .header("Authorization", "Bearer $token")
            .header("Accept", "text/event-stream")
            .get()
            .build()
        return client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build().newCall(request)
    }

    /** Blocks reading SSE frames until the server closes or the call is cancelled. */
    fun readNotificationEvents(call: Call, onEvent: (NotificationDto) -> Unit) {
        call.execute().use { resp ->
            if (resp.code == 401) throw ApiException.Unauthorized
            if (!resp.isSuccessful) throw ApiException.Http(resp.code)
            val source = resp.body?.source() ?: return
            var event = "message"
            val data = StringBuilder()
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                when {
                    line.startsWith("event:") -> event = line.substring(6).trim()
                    line.startsWith("data:") -> data.append(line.substring(5).trim())
                    line.isEmpty() -> {
                        if (event == "notification" && data.isNotEmpty()) {
                            runCatching { json.decodeFromString<NotificationDto>(data.toString()) }.onSuccess(onEvent)
                        }
                        event = "message"
                        data.clear()
                    }
                }
            }
        }
    }

    private suspend inline fun <reified T> patchJson(
        baseUrl: String,
        token: String,
        path: String,
        bodyText: String,
    ): T = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url(baseUrl, path))
            .header("Authorization", "Bearer $token")
            .patch(bodyText.toRequestBody(jsonMedia))
            .build()
        client.newCall(request).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            when {
                resp.isSuccessful -> json.decodeFromString<T>(text)
                resp.code == 401 -> throw ApiException.Unauthorized
                else -> throw ApiException.Http(resp.code)
            }
        }
    }

    private suspend inline fun <reified T> postJson(
        baseUrl: String,
        token: String,
        path: String,
        bodyText: String,
        decode: Boolean = true,
        longCall: Boolean = false,
    ): T = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url(baseUrl, path))
            .header("Authorization", "Bearer $token")
            .post(bodyText.toRequestBody(jsonMedia))
            .build()
        (if (longCall) slowClient else client).newCall(request).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            when {
                resp.isSuccessful && decode -> json.decodeFromString<T>(text)
                resp.isSuccessful -> Unit as T
                resp.code == 401 -> throw ApiException.Unauthorized
                else -> throw ApiException.Http(resp.code)
            }
        }
    }

    private suspend inline fun <reified T> getJson(
        baseUrl: String,
        token: String,
        path: String,
        params: Map<String, String>,
    ): T = withContext(Dispatchers.IO) {
        val urlBuilder = url(baseUrl, path).toHttpUrl().newBuilder()
        params.forEach { (k, v) -> urlBuilder.addQueryParameter(k, v) }
        val request = Request.Builder()
            .url(urlBuilder.build())
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(request).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            when {
                resp.isSuccessful -> json.decodeFromString<T>(text)
                resp.code == 401 -> throw ApiException.Unauthorized
                else -> throw ApiException.Http(resp.code)
            }
        }
    }

    private fun url(baseUrl: String, path: String): String =
        baseUrl.trimEnd('/') + path
}
