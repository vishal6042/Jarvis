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

    suspend fun accounts(baseUrl: String, token: String): List<AccountDto> =
        getJson(baseUrl, token, "/api/accounts", emptyMap())

    suspend fun byCategory(baseUrl: String, token: String, from: String, to: String): List<CategorySpendDto> =
        getJson(baseUrl, token, "/api/analytics/by-category", mapOf("from" to from, "to" to to))

    suspend fun recentTransactions(baseUrl: String, token: String, size: Int = 10): List<TransactionDto> =
        getJson(baseUrl, token, "/api/transactions", mapOf("page" to "0", "size" to size.toString()))

    /** Ask the local agent a question; it can take a while, so this call has its own long timeout. */
    suspend fun chat(baseUrl: String, token: String, message: String, context: String?): String =
        postJson<ChatReplyDto>(baseUrl, token, "/api/ai/chat", json.encodeToString(ChatRequestDto(message, context)), longCall = true).answer

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
