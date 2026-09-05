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
    String notes,
    /** Optional: last digits of the linked account; alerts for it then update this investment. */
    String accountLast4,
    LocalDate valueAsOf,
    LocalDate lastContributionOn,
    /** True for payslip deductions (EPF, corporate NPS): never money still to pay. */
    Boolean salaryDeducted,
    /** "monthly" (default) or "yearly" — how often the instalment falls due. */
    String contributionFrequency) {}
