package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A savings/investment instrument owned by a member (FD/RD/PPF/PF/NSC/KVP/SSY/MF). */
@Entity
@Table(name = "investment")
@Getter
@Setter
@NoArgsConstructor
public class Investment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(nullable = false, length = 8)
    private String kind;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal principal = BigDecimal.ZERO;

    /** Current value (column avoids the SQL reserved word `current`). */
    @Column(name = "current_value", nullable = false, precision = 16, scale = 2)
    private BigDecimal current = BigDecimal.ZERO;

    private Double rate;

    /** Monthly SIP / recurring contribution. */
    @Column(precision = 16, scale = 2)
    private BigDecimal sip;

    @Column(name = "opening_date")
    private LocalDate openingDate;

    @Column(name = "commencement_date")
    private LocalDate commencementDate;

    @Column(name = "maturity_date")
    private LocalDate maturityDate;

    @Column(columnDefinition = "text")
    private String notes;
}
