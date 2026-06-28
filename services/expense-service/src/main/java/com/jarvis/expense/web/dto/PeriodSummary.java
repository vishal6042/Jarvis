package com.jarvis.expense.web.dto;

import java.math.BigDecimal;
import java.time.Instant;

/** Earning (CREDIT) vs spend (DEBIT) totals over a window. */
public record PeriodSummary(Instant from, Instant to, BigDecimal earning, BigDecimal spend) {}
