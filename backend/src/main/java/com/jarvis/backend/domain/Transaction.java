package com.jarvis.backend.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A single financial transaction, parsed from an alert or entered manually. */
@Entity
@Table(
    name = "transaction",
    indexes = {
        @Index(name = "idx_txn_occurred_at", columnList = "occurred_at"),
        @Index(name = "idx_txn_account", columnList = "account_id")
    })
@Getter
@Setter
@NoArgsConstructor
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning account; null until matched to one (parser fills it by last-4). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Direction direction;

    @Column(length = 256)
    private String merchant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageSource source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "raw_message_id")
    private RawMessage rawMessage;

    /** Stable hash (account+amount+date+merchant) used to dedupe SMS vs email of the same txn. */
    @Column(name = "dedup_hash", length = 64, unique = true)
    private String dedupHash;

    @Column(columnDefinition = "text")
    private String note;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
