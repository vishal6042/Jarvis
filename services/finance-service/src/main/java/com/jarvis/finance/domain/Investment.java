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

    // ---- Linked bank/post-office account: alerts for it update this investment ----

    /** Last digits of the instrument's account number as they appear in its SMS alerts (e.g. "1507"). */
    @Column(name = "account_last4", length = 4)
    private String accountLast4;

    /**
     * True when the contribution is taken out of the payslip (EPF, corporate NPS). The salary that
     * reaches the bank is already net of it, so it is never money the user still has to pay.
     */
    @Column(name = "salary_deducted", nullable = false)
    private boolean salaryDeducted = false;

    /** How often {@link #sip} is paid: "monthly" (RD, SIP, EPF) or "yearly" (LIC premiums). */
    @Column(name = "contribution_frequency", nullable = false, length = 10)
    private String contributionFrequency = "monthly";

    /** Date of the alert that last set {@link #current}, so an older alert never overwrites a newer value. */
    @Column(name = "value_as_of")
    private LocalDate valueAsOf;

    /** Date of the last contribution counted into {@link #principal} (guards against double counting). */
    @Column(name = "last_contribution_on")
    private LocalDate lastContributionOn;
}
