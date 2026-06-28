package com.jarvis.ingestion.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A raw inbound alert (SMS/email/statement line) — audited and re-processable. */
@Entity
@Table(name = "raw_message")
@Getter
@Setter
@NoArgsConstructor
public class RawMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageSource source;

    /** The full raw text of the alert. */
    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    /** Sender hint: SMS sender id (e.g. "VM-HDFCBK") or email From address. */
    @Column(length = 320)
    private String sender;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ParseStatus status = ParseStatus.PENDING;

    /** The transaction id created in expense-service (when status = PARSED). */
    @Column(name = "transaction_ref")
    private Long transactionRef;

    /** Failure detail when status = FAILED. */
    @Column(columnDefinition = "text")
    private String error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
