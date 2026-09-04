package com.jarvis.finance.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class RdMathTest {

    @Test
    void matchesIndiaPostPublishedMaturity() {
        // India Post RD calculator: Rs 5,000/month, 5 years, 6.7% p.a. compounded quarterly → ~Rs 3,56,830.
        BigDecimal value = RdMath.accruedValue(new BigDecimal("5000"), 60, 6.7);
        assertTrue(value.doubleValue() > 355_000 && value.doubleValue() < 358_500, "got " + value);
    }

    @Test
    void eighteenMonthsAtEightPercent() {
        BigDecimal value = RdMath.accruedValue(new BigDecimal("5000"), 18, 8.0);
        assertTrue(value.doubleValue() > 95_500 && value.doubleValue() < 96_300, "got " + value);
    }

    @Test
    void zeroRateIsJustTheDeposits() {
        assertEquals(new BigDecimal("90000"), RdMath.accruedValue(new BigDecimal("5000"), 18, 0));
    }

    @Test
    void neverBelowDepositsAndZeroWhenNothingPaid() {
        assertTrue(RdMath.accruedValue(new BigDecimal("5000"), 1, 8.0).doubleValue() >= 5000);
        assertEquals(BigDecimal.ZERO, RdMath.accruedValue(new BigDecimal("5000"), 0, 8.0));
    }

    @Test
    void instalmentsFromBalance() {
        assertEquals(18, RdMath.instalmentsFor(new BigDecimal("90000.00"), new BigDecimal("5000")));
        assertEquals(19, RdMath.instalmentsFor(new BigDecimal("95000"), new BigDecimal("5000")));
        assertEquals(0, RdMath.instalmentsFor(new BigDecimal("95000"), null));
    }
}
