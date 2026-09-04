package com.jarvis.ingestion.web.dto;

import java.util.List;

/** The reviewed statement the user confirmed — persisted (deduped) into expense-service. */
public record ConfirmStatementRequest(
    String fileName,
    String bank,
    String last4,
    String accountType,
    List<PreviewTransaction> transactions) {}
