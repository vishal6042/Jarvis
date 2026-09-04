package com.jarvis.expense.web.dto;

import java.math.BigDecimal;

/** One point on the net-worth trend: the savings balance at the end of {@code month} (yyyy-MM). */
public record NetWorthPoint(String month, BigDecimal netWorth) {}
