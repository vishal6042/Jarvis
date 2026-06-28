package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A loan owned by a member (HOME/CAR/PERSONAL/EDUCATION/GOLD/BUSINESS). */
@Entity
@Table(name = "loan")
@Getter
@Setter
@NoArgsConstructor
public class Loan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(nullable = false, length = 12)
    private String kind;

    @Column(nullable = false)
    private String lender;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal sanctioned = BigDecimal.ZERO;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal outstanding = BigDecimal.ZERO;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal emi = BigDecimal.ZERO;

    private Double rate;

    @Column(name = "tenure_months")
    private Integer tenureMonths;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(columnDefinition = "text")
    private String notes;
}
