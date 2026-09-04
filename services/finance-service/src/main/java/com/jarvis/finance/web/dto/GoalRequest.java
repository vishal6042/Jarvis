package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.time.LocalDate;

public record GoalRequest(
    @NotBlank String name,
    @NotNull @Positive BigDecimal targetAmount,
    @PositiveOrZero BigDecimal savedAmount,
    LocalDate targetDate,
    String color,
    String notes) {}
