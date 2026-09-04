package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A savings goal: progress toward {@code targetAmount} (optionally by {@code targetDate}). */
@Entity
@Table(name = "goal")
@Getter
@Setter
@NoArgsConstructor
public class Goal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "target_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal targetAmount = BigDecimal.ZERO;

    @Column(name = "saved_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal savedAmount = BigDecimal.ZERO;

    @Column(name = "target_date")
    private LocalDate targetDate;

    @Column(length = 16)
    private String color;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
