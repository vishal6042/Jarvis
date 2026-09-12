package com.jarvis.expense.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day's spending: what went out, and how many purchases made it up. */
public record DaySpend(LocalDate day, BigDecimal total, int count) {}
