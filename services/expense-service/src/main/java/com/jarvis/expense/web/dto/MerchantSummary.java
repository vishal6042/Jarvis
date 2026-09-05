package com.jarvis.expense.web.dto;

import java.math.BigDecimal;

/**
 * One raw merchant string as it appears across the ledger, with what is already known about it.
 *
 * @param raw            the alert's own text
 * @param canonical      the accepted clean name, null when nothing has been decided yet
 * @param category       the category the alias carries, null when it carries none
 * @param count          how many transactions use this exact string
 * @param total          their combined amount
 * @param uncategorised  how many of them still have no category
 * @param source         "ai" or "user" when an alias exists, null otherwise
 */
public record MerchantSummary(
    String raw,
    String canonical,
    String category,
    long count,
    BigDecimal total,
    long uncategorised,
    String source) {}
