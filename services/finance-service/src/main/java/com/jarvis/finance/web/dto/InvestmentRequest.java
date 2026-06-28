package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record InvestmentRequest(
    @NotNull Long memberId,
    @NotBlank String kind,
    @NotBlank String name,
    BigDecimal principal,
    BigDecimal current,
    Double rate,
    BigDecimal sip,
    LocalDate openingDate,
    LocalDate commencementDate,
    LocalDate maturityDate,
    String notes) {}
