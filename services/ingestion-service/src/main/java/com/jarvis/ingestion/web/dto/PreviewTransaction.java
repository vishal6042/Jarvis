package com.jarvis.ingestion.web.dto;

import java.math.BigDecimal;

/** One parsed-and-cleaned statement row, shown for review and sent back on confirm. */
public record PreviewTransaction(
    String occurredOn, // yyyy-MM-dd (or null)
    String merchant,
    BigDecimal amount,
    String direction, // DEBIT | CREDIT
    String category,
    String last4) {}
