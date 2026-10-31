import type { Investment } from "@/lib/sample";

/**
 * Statutory gratuity (Payment of Gratuity Act 1972, now the Code on Social Security 2020):
 * basic + DA × 15/26 × years of service, a final part-year over six months counting as a year,
 * capped at ₹20 lakh — also the tax-free limit for private-sector employees. Paid after 5 years.
 * Mirrors finance-service's GratuityMath, which keeps the stored value current.
 */
export const GRATUITY_CAP = 2_000_000;
export const GRATUITY_MIN_YEARS = 5;

const at = (iso: string) => new Date(`${iso}T00:00:00`);

/** Completed years and leftover months/days between two dates. */
function span(from: Date, to: Date) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  return { years: Math.floor(months / 12), months: months % 12, days };
}

export interface GratuityStatus {
  wage: number;
  joined: string;
  /** Years counted for the payout (part-year over six months rounds up). */
  years: number;
  /** "14 yrs 3 mo" — actual service. */
  service: string;
  /** What one year of service adds: wage × 15/26. */
  perYear: number;
  /** Formula amount before the cap. */
  formula: number;
  value: number;
  capped: boolean;
  /** Payable yet (5 years done)? */
  eligible: boolean;
  eligibleOn: Date;
  /** When the formula first reaches ₹20 lakh at today's wage, if it hasn't yet. */
  capOn: Date | null;
}

export function gratuityStatus(inv: Investment, today = new Date()): GratuityStatus | null {
  if (inv.kind !== "GRATUITY" || !inv.monthlyWage || inv.monthlyWage <= 0 || !inv.openingDate) return null;
  const joined = at(inv.openingDate);
  if (joined >= today) return null;
  const s = span(joined, today);
  const years = s.years + (s.months > 6 || (s.months === 6 && s.days > 0) ? 1 : 0);
  const perYear = (inv.monthlyWage * 15) / 26;
  const formula = Math.round(perYear * years);
  const eligibleOn = new Date(joined.getFullYear() + GRATUITY_MIN_YEARS, joined.getMonth(), joined.getDate());

  let capOn: Date | null = null;
  if (formula < GRATUITY_CAP) {
    // The count steps up a day after each half-year mark past a full year: N years + 6 months + 1 day.
    const need = Math.ceil(GRATUITY_CAP / perYear);
    capOn = new Date(joined.getFullYear() + need - 1, joined.getMonth() + 6, joined.getDate() + 1);
  }
  return {
    wage: inv.monthlyWage,
    joined: inv.openingDate,
    years,
    service: `${s.years} yrs${s.months ? ` ${s.months} mo` : ""}`,
    perYear,
    formula,
    value: Math.min(formula, GRATUITY_CAP),
    capped: formula >= GRATUITY_CAP,
    eligible: today >= eligibleOn,
    eligibleOn,
    capOn,
  };
}
