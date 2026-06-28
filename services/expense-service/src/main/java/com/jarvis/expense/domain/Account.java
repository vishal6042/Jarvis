package com.jarvis.expense.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A bank account or credit card the user owns. Transactions are matched to it by last-4. */
@Entity
@Table(
    name = "account",
    uniqueConstraints = @UniqueConstraint(columnNames = {"bank", "last4", "type"}))
@Getter
@Setter
@NoArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String bank;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AccountType type;

    /** Last 4 digits of the card / account number, as it appears in alerts. */
    @Column(nullable = false, length = 4)
    private String last4;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false, length = 3)
    private String currency = "INR";

    // ---- Card-specific (nullable; used for CREDIT_CARD / DEBIT_CARD) ----
    @Column(length = 20)
    private String network; // VISA, MASTERCARD, RUPAY, AMEX

    @Column(name = "card_holder_name")
    private String cardHolderName;

    @Column(name = "credit_limit", precision = 14, scale = 2)
    private BigDecimal creditLimit;

    @Column(name = "billing_cycle_day")
    private Integer billingCycleDay; // 1..31

    @Column(name = "payment_due_day")
    private Integer paymentDueDay; // 1..31

    @Column(name = "expiry_month")
    private Integer expiryMonth; // 1..12

    @Column(name = "expiry_year")
    private Integer expiryYear; // e.g. 2029

    // ---- Bank-specific (nullable; used for SAVINGS) ----
    @Column(length = 11)
    private String ifsc;

    private String branch;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
