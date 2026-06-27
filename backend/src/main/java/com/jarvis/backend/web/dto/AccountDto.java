package com.jarvis.backend.web.dto;

import com.jarvis.backend.domain.Account;
import com.jarvis.backend.domain.AccountType;
import java.math.BigDecimal;

public record AccountDto(
    Long id,
    String bank,
    AccountType type,
    String last4,
    String displayName,
    String currency,
    String network,
    String cardHolderName,
    BigDecimal creditLimit,
    Integer billingCycleDay,
    Integer paymentDueDay,
    Integer expiryMonth,
    Integer expiryYear,
    String ifsc,
    String branch) {

    public static AccountDto from(Account a) {
        return new AccountDto(
            a.getId(),
            a.getBank(),
            a.getType(),
            a.getLast4(),
            a.getDisplayName(),
            a.getCurrency(),
            a.getNetwork(),
            a.getCardHolderName(),
            a.getCreditLimit(),
            a.getBillingCycleDay(),
            a.getPaymentDueDay(),
            a.getExpiryMonth(),
            a.getExpiryYear(),
            a.getIfsc(),
            a.getBranch());
    }
}
