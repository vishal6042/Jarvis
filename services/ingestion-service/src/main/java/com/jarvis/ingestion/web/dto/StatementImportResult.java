package com.jarvis.ingestion.web.dto;

/** Outcome of importing one statement file. */
public record StatementImportResult(
    String fileName,
    String accountName, // matched-or-created account, e.g. "HDFC •••• 1234" (null if undetermined)
    String bank,
    String last4,
    int total,          // transactions the AI found
    int imported,       // newly persisted
    int duplicates,     // already existed (deduped)
    int skipped) {}     // rows missing amount/direction
