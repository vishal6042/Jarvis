package com.jarvis.expense.web.dto;

import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.MessageSource;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Internal create payload used by ingestion-service after the AI parser extracts a transaction.
 * The account is matched here by {@code last4}; dedup is enforced on save.
 */
public record InternalTransactionRequest(
    String last4,
    @NotNull @Positive BigDecimal amount,
    String currency,
    @NotNull Direction direction,
    String merchant,
    String category,
    Instant occurredAt,
    MessageSource source,
    String sourceRef) {}
