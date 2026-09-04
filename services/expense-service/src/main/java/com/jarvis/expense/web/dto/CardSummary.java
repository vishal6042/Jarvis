package com.jarvis.expense.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One credit card's cycle at a glance. Statement dates come from the card's billing day; the
 * last payment from settlement pairing. Money figures are never null (0 when unknown).
 *
 * @param unbilled   purchases since the last statement (minus refunds)
 * @param billed     purchases in the last statement period
 * @param paid       bill payments received since the last statement
 * @param billDue    max(0, billed − paid)
 */
public record CardSummary(
    Long accountId,
    String displayName,
    String bank,
    String last4,
    String network,
    BigDecimal creditLimit,
    LocalDate lastStatementOn,
    LocalDate nextStatementOn,
    LocalDate dueOn,
    BigDecimal unbilled,
    BigDecimal billed,
    BigDecimal paid,
    BigDecimal billDue,
    LocalDate lastPaidOn,
    BigDecimal lastPaidAmount,
    Integer utilisationPct) {}
