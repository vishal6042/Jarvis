package com.jarvis.finance.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Recurring-deposit arithmetic as used by India Post / banks: a fixed monthly instalment with
 * interest compounded quarterly. The alert for such an account states the deposits so far, not
 * the accrued value, so the value has to be computed.
 */
public final class RdMath {

    private RdMath() {}

    /**
     * Value of a recurring deposit after {@code months} instalments of {@code instalment} at
     * {@code annualRatePct}, compounded quarterly.
     * <p>
     * Standard closed form with quarterly rate {@code i} and {@code n = months / 3} quarters:
     * {@code M = R × ((1 + i)^n − 1) / (1 − (1 + i)^(−1/3))}. Months that don't complete a quarter
     * are treated as a fractional quarter, which is a close approximation between quarter ends.
     */
    public static BigDecimal accruedValue(BigDecimal instalment, int months, double annualRatePct) {
        if (instalment == null || months <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal deposits = instalment.multiply(BigDecimal.valueOf(months));
        if (annualRatePct <= 0) {
            return deposits;
        }
        double i = annualRatePct / 400.0;
        double n = months / 3.0;
        double factor = (Math.pow(1 + i, n) - 1) / (1 - Math.pow(1 + i, -1.0 / 3.0));
        BigDecimal value = instalment.multiply(BigDecimal.valueOf(factor)).setScale(2, RoundingMode.HALF_UP);
        return value.max(deposits);
    }

    /** How many instalments the stated deposit balance represents (e.g. 90,000 / 5,000 = 18). */
    public static int instalmentsFor(BigDecimal depositBalance, BigDecimal instalment) {
        if (depositBalance == null || instalment == null || instalment.signum() <= 0) {
            return 0;
        }
        return depositBalance.divide(instalment, 0, RoundingMode.HALF_UP).intValue();
    }
}
