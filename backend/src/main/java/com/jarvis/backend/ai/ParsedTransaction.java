package com.jarvis.backend.ai;

/**
 * Structured result the LLM extracts from a single bank alert. Fields are strings on purpose:
 * a small local model occasionally emits "" for absent values, which would break enum/number
 * coercion — so amount and direction are parsed defensively in the ingestion pipeline.
 * Provider-agnostic — any model behind {@link TransactionParser} fills this shape.
 */
public record ParsedTransaction(
    boolean isTransaction,
    String amount,
    String currency,
    String direction, // "DEBIT" / "CREDIT"
    String merchant,
    String last4,
    String bank,
    String occurredOn, // ISO date yyyy-MM-dd, or null
    String category) {}
