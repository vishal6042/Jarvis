package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One occurrence of a reminder marked paid by the user. Reminders whose amount varies (an
 * electricity bill) can never be closed by matching a transaction, so this records it explicitly.
 * {@code transactionId} optionally points at the real payment in expense-service (no cross-DB FK).
 */
@Entity
@Table(
    name = "reminder_payment",
    uniqueConstraints = @UniqueConstraint(columnNames = {"reminder_id", "occurred_on"}))
@Getter
@Setter
@NoArgsConstructor
public class ReminderPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reminder_id", nullable = false)
    private Reminder reminder;

    /** The occurrence being closed: which dated instance of a (possibly monthly) reminder. */
    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    /** When it was actually paid. */
    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    @Column(precision = 16, scale = 2)
    private BigDecimal amount;

    /** expense-service transaction id, when the user linked the real payment. */
    @Column(name = "transaction_id")
    private Long transactionId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
