package com.jarvis.ingestion.web.dto;

import java.math.BigDecimal;
import java.util.List;

/** What the AI found in a statement, shown for review before anything is written to the DB. */
public record StatementPreview(
    String fileName,
    AccountInfo account,
    String fromDate, // earliest transaction date (yyyy-MM-dd, or null)
    String toDate,   // latest transaction date
    BigDecimal spending, // Σ DEBIT
    BigDecimal earning,  // Σ CREDIT
    int total,           // number of transactions found
    List<PreviewTransaction> transactions) {

    /** The account the statement belongs to, and whether it is new (will be created on confirm). */
    public record AccountInfo(
        String bank,
        String last4,
        String accountType, // SAVINGS | CREDIT_CARD
        String displayName,
        boolean isNew) {}
}
