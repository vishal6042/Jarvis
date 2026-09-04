package com.jarvis.expense.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** A detected recurring payment / subscription (regular cadence, stable-ish merchant). */
public record RecurringPayment(
    String merchant,
    String category,
    BigDecimal amount, // average charge
    String cadence, // Weekly | Monthly | Quarterly | Yearly
    LocalDate lastPaid,
    LocalDate nextExpected,
    int occurrences,
    BigDecimal monthlyEstimate) {}
