package com.jarvis.expense.web.dto;

import com.jarvis.expense.domain.AccountType;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/** Create/update payload for a bank account or card. Card/bank-specific fields are optional. */
public record AccountRequest(
    @NotBlank String bank,
    @NotNull AccountType type,
    @NotBlank @Pattern(regexp = "\\d{4}", message = "last4 must be exactly 4 digits") String last4,
    @NotBlank String displayName,
    String currency,
    // card fields
    String network,
    String cardHolderName,
    @PositiveOrZero BigDecimal creditLimit,
    @Min(1) @Max(31) Integer billingCycleDay,
    @Min(1) @Max(31) Integer paymentDueDay,
    @Min(1) @Max(12) Integer expiryMonth,
    @Min(2000) @Max(2100) Integer expiryYear,
    @Size(max = 60) String billingGroup,
    // bank fields
    String ifsc,
    String branch,
    @PositiveOrZero BigDecimal balance,
    /** Whose account this is; null leaves it unassigned. */
    Long memberId) {}
