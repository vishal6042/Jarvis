package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A monthly spend threshold for a category; crossing it triggers a notification. */
@Entity
@Table(name = "category_threshold", uniqueConstraints = @UniqueConstraint(columnNames = "category"))
@Getter
@Setter
@NoArgsConstructor
public class CategoryThreshold {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    public CategoryThreshold(String category, BigDecimal amount) {
        this.category = category;
        this.amount = amount;
    }
}
