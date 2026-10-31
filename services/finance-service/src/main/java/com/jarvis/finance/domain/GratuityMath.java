package com.jarvis.finance.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.Period;

/**
 * Statutory gratuity in India (Payment of Gratuity Act 1972, carried into the Code on Social
 * Security 2020 from 21 Nov 2025): 15 days' wages for each completed year of service, where a
 * month's wage is basic + DA and a month counts as 26 working days. A final part-year of more
 * than six months counts as a full year. The amount is capped at Rs 20 lakh, which is also the
 * tax-free limit for private-sector employees. It is payable after 5 years of continuous service.
 */
public final class GratuityMath {

    public static final BigDecimal CAP = new BigDecimal("2000000");
    public static final int MIN_YEARS = 5;

    private GratuityMath() {}

    /** Years of service counted for gratuity: completed years, plus one for a part-year over six months. */
    public static int countedYears(LocalDate joined, LocalDate on) {
        if (joined == null || on == null || !on.isAfter(joined)) {
            return 0;
        }
        Period p = Period.between(joined, on);
        boolean overSixMonths = p.getMonths() > 6 || (p.getMonths() == 6 && p.getDays() > 0);
        return p.getYears() + (overSixMonths ? 1 : 0);
    }

    /** wage x 15/26 x years, before the cap. */
    public static BigDecimal formula(BigDecimal monthlyWage, int years) {
        if (monthlyWage == null || monthlyWage.signum() <= 0 || years <= 0) {
            return BigDecimal.ZERO;
        }
        return monthlyWage.multiply(BigDecimal.valueOf(15L * years)).divide(BigDecimal.valueOf(26), 0, RoundingMode.HALF_UP);
    }

    /** The gratuity earned so far, capped. Shown even before 5 years, as what has built up. */
    public static BigDecimal value(BigDecimal monthlyWage, LocalDate joined, LocalDate on) {
        return formula(monthlyWage, countedYears(joined, on)).min(CAP);
    }

    /**
     * Recompute a gratuity holding from its wage and joining date (its opening date). Leaves it
     * alone when either is missing, so a value typed in by hand stays.
     *
     * @return true when the holding was changed
     */
    public static boolean refresh(Investment i, LocalDate on) {
        if (!"GRATUITY".equalsIgnoreCase(i.getKind()) || i.getMonthlyWage() == null || i.getOpeningDate() == null) {
            return false;
        }
        BigDecimal v = value(i.getMonthlyWage(), i.getOpeningDate(), on).setScale(2, RoundingMode.HALF_UP);
        boolean changed = i.getCurrent() == null || v.compareTo(i.getCurrent()) != 0;
        // Employer-funded: nothing was put in, so "invested" mirrors the value and no gain is shown.
        i.setCurrent(v);
        i.setPrincipal(v);
        if (changed || i.getValueAsOf() == null) {
            i.setValueAsOf(on);
        }
        return changed;
    }
}
