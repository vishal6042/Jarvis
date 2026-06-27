package com.jarvis.backend.domain;

/** Lifecycle of a raw ingested message as it is turned into a transaction. */
public enum ParseStatus {
    PENDING,    // received, not yet parsed
    PARSED,     // successfully turned into a transaction
    FAILED,     // parser could not extract a transaction
    IGNORED,    // not a transaction alert (OTP, promo, etc.)
    DUPLICATE   // parsed but matched an existing transaction
}
