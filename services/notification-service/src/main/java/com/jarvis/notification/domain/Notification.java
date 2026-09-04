package com.jarvis.notification.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A single notification shown in the bell. {@code dedupeKey} is unique so the rule engine can
 * re-run every tick without creating duplicates (insert-if-absent).
 */
@Entity
@Table(name = "notification")
@Getter
@Setter
@NoArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** THRESHOLD | UNUSUAL | FINDING | SYNC | PAYMENT | EXPIRY. */
    @Column(nullable = false, length = 16)
    private String type;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 512)
    private String message;

    /** Frontend route to deep-link to (e.g. /analytics). */
    @Column(nullable = false, length = 64)
    private String href;

    @Column(nullable = false, length = 16)
    private String color;

    @Column(name = "dedupe_key", nullable = false, length = 128, unique = true)
    private String dedupeKey;

    @Column(name = "is_read", nullable = false)
    private boolean read = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
