package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record LoanRequest(
    @NotNull Long memberId,
    @NotBlank String kind,
    @NotBlank String lender,
    BigDecimal sanctioned,
    BigDecimal outstanding,
    BigDecimal emi,
    Double rate,
    Integer tenureMonths,
    LocalDate startDate,
    LocalDate endDate,
    String notes,
    /** Optional link to alerts: loan account digits, and/or the savings account the EMI is debited from. */
    String loanAccountLast4,
    String emiFromLast4) {}
