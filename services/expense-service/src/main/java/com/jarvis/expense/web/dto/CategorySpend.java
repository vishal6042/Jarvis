package com.jarvis.expense.web.dto;

import java.math.BigDecimal;

/** Total spend for one category over a window. */
public record CategorySpend(String category, BigDecimal total) {}
