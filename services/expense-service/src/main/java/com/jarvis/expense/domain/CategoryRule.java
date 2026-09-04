package com.jarvis.expense.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** "Merchant contains {pattern}" → {category}. Case-insensitive. */
@Entity
@Table(name = "category_rule")
@Getter
@Setter
@NoArgsConstructor
public class CategoryRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String pattern;

    @Column(nullable = false, length = 80)
    private String category;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public boolean matches(String merchant) {
        return merchant != null && !pattern.isBlank() && merchant.toLowerCase().contains(pattern.toLowerCase());
    }
}
