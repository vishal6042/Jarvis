package com.jarvis.sync.data

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
