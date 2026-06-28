package com.jarvis.expense.web.dto;

import com.jarvis.expense.domain.Direction;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.time.Instant;

/** Manual transaction entry. accountId/category/occurredAt are optional. */
public record CreateTransactionRequest(
    Long accountId,
    @NotNull @Positive BigDecimal amount,
    String currency,
    @NotNull Direction direction,
    String merchant,
    String category,
    Instant occurredAt,
    String note) {}
