package com.jarvis.finance.web.dto;

import com.jarvis.finance.domain.ReminderPayment;
import java.math.BigDecimal;
import java.time.LocalDate;

/** One reminder occurrence the user marked paid. */
public record ReminderPaymentDto(
    Long id,
    Long reminderId,
    LocalDate occurredOn,
    LocalDate paidOn,
    BigDecimal amount,
    Long transactionId) {

    public static ReminderPaymentDto from(ReminderPayment p) {
        return new ReminderPaymentDto(
            p.getId(),
            p.getReminder().getId(),
            p.getOccurredOn(),
            p.getPaidOn(),
            p.getAmount(),
            p.getTransactionId());
    }
}
