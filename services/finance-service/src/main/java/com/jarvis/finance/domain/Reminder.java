package com.jarvis.finance.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A calendar reminder (rent/bill/EMI/investment/SIP), optionally recurring monthly. */
@Entity
@Table(name = "reminder")
@Getter
@Setter
@NoArgsConstructor
public class Reminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    /** Base occurrence (column avoids the reserved word `date`). */
    @Column(name = "due_date", nullable = false)
    private LocalDate date;

    /** RENT / BILL / EMI / INVESTMENT / SIP / OTHER. */
    @Column(name = "reminder_type", nullable = false, length = 16)
    private String type;

    @Column(precision = 16, scale = 2)
    private BigDecimal amount;

    @Column(columnDefinition = "text")
    private String notes;

    /** "none" or "monthly" (column avoids the reserved word `repeat`). */
    @Column(name = "repeat_mode", nullable = false, length = 12)
    private String repeat = "none";
}
