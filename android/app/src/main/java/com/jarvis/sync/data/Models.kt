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
    val type: String,
    val balance: Double? = null,
    @SerialName("displayName") val displayName: String? = null,
)

@Serializable
data class CategorySpendDto(
    val category: String,
    val total: Double,
)
