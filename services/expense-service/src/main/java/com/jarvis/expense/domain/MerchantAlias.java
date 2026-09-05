package com.jarvis.expense.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One raw merchant string as it appears in alerts, mapped to a clean name and (optionally) the
 * category it belongs in. Exact match on {@link #raw}; the fuzzy "merchant contains …" matching
 * stays with {@link CategoryRule}.
 */
@Entity
@Table(name = "merchant_alias")
@Getter
@Setter
@NoArgsConstructor
public class MerchantAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The alert's own text, e.g. "UPI-653782697753-Blinkit IN". */
    @Column(nullable = false, length = 256, unique = true)
    private String raw;

    /** What a person would call it, e.g. "Blinkit". */
    @Column(nullable = false, length = 128)
    private String canonical;

    @Column(length = 64)
    private String category;

    /** "ai" when the model suggested it and the user accepted, "user" when typed by hand. */
    @Column(nullable = false, length = 16)
    private String source = "user";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
