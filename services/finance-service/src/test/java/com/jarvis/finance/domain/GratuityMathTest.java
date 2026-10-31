package com.jarvis.finance.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class GratuityMathTest {

    @Test
    void textbookExample() {
        // Rs 50,000 basic + DA, 10 years: 50,000 x 15/26 x 10 = 2,88,462.
        assertEquals(new BigDecimal("288462"), GratuityMath.formula(new BigDecimal("50000"), 10));
    }

    @Test
    void partYearOverSixMonthsCountsAsAYear() {
        LocalDate joined = LocalDate.of(2012, 1, 1);
        assertEquals(14, GratuityMath.countedYears(joined, LocalDate.of(2026, 7, 1)));  // exactly 6 months over
        assertEquals(15, GratuityMath.countedYears(joined, LocalDate.of(2026, 7, 2)));  // just over 6 months
        assertEquals(0, GratuityMath.countedYears(joined, joined));
    }

    @Test
    void cappedAtTwentyLakh() {
        // Rs 2,30,183 x 15/26 x 16 = 21.2 lakh, paid out as 20 lakh.
        BigDecimal v = GratuityMath.value(new BigDecimal("230183"), LocalDate.of(2010, 1, 1), LocalDate.of(2026, 1, 1));
        assertEquals(0, GratuityMath.CAP.compareTo(v));
    }

    @Test
    void refreshSetsValueAndLeavesHandTypedOnesAlone() {
        Investment g = new Investment();
        g.setKind("GRATUITY");
        g.setCurrent(new BigDecimal("1900000"));
        assertFalse(GratuityMath.refresh(g, LocalDate.of(2026, 10, 31)));  // no wage / joining date yet
        assertEquals(new BigDecimal("1900000"), g.getCurrent());

        g.setMonthlyWage(new BigDecimal("50000"));
        g.setOpeningDate(LocalDate.of(2016, 10, 1));
        assertTrue(GratuityMath.refresh(g, LocalDate.of(2026, 10, 31)));
        assertEquals(0, new BigDecimal("288462").compareTo(g.getCurrent()));
        assertEquals(0, g.getCurrent().compareTo(g.getPrincipal()));
    }

    @Test
    void otherKindsUntouched() {
        Investment fd = new Investment();
        fd.setKind("FD");
        fd.setMonthlyWage(new BigDecimal("50000"));
        fd.setOpeningDate(LocalDate.of(2016, 1, 1));
        assertFalse(GratuityMath.refresh(fd, LocalDate.of(2026, 10, 31)));
    }
}
