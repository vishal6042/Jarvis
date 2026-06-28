package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record ReminderRequest(
    @NotBlank String title,
    @NotNull LocalDate date,
    @NotBlank String type,
    BigDecimal amount,
    String notes,
    String repeat) {}
