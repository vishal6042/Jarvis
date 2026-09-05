package com.jarvis.expense.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One credit card's cycle at a glance. Statement dates come from the card's billing day; the
 * last payment from settlement pairing. Money figures are never null (0 when unknown).
 *
 * <p>Cards that share a {@code billingGroup} are billed on one consolidated statement, so their
 * {@code billed}, {@code paid}, {@code billDue}, {@code lastPaid*}, statement/due dates and
 * utilisation are the group's totals — the same on every card in the group. {@code unbilled} stays
 * per card, since each card has its own purchases.
 *
 * @param unbilled     purchases since the last statement (minus refunds), for this card alone
 * @param billed       purchases in the last statement period (group total when grouped)
 * @param paid         bill payments received since the last statement (group total when grouped)
 * @param billDue      max(0, billed − paid)
 * @param billingGroup non-null when this card shares a statement with others
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
    Integer utilisationPct,
    String billingGroup) {}
