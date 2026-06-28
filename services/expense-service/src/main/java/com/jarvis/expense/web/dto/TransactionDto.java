package com.jarvis.expense.web.dto;

import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.MessageSource;
import com.jarvis.expense.domain.Transaction;
import java.math.BigDecimal;
import java.time.Instant;

public record TransactionDto(
    Long id,
    Long accountId,
    String accountName,
    BigDecimal amount,
    String currency,
    Direction direction,
    String merchant,
    String category,
    Instant occurredAt,
    MessageSource source,
    String note) {

    public static TransactionDto from(Transaction t) {
        return new TransactionDto(
            t.getId(),
            t.getAccount() != null ? t.getAccount().getId() : null,
            t.getAccount() != null ? t.getAccount().getDisplayName() : null,
            t.getAmount(),
            t.getCurrency(),
            t.getDirection(),
            t.getMerchant(),
            t.getCategory() != null ? t.getCategory().getName() : null,
            t.getOccurredAt(),
            t.getSource(),
            t.getNote());
    }
}
