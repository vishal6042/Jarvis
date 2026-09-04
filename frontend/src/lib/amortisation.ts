import type { Loan } from "@/lib/sample";

/** One month of a reducing-balance loan schedule. */
export interface AmortRow {
  month: number; // 1-based from today
  on: string; // yyyy-MM
  payment: number;
  interest: number;
  principal: number;
  balance: number; // after this payment
}

export interface YearSlice {
  year: string;
  interest: number;
  principal: number;
}

export interface Amortisation {
  rows: AmortRow[];
  months: number;
  totalInterest: number;
  totalPaid: number;
  debtFreeOn: Date;
  byYear: YearSlice[];
}

const MAX_MONTHS = 1200;

/**
 * Project a loan from its current outstanding balance at a fixed monthly payment (EMI + optional
 * extra) with reducing-balance interest. `lumpSum` is knocked off the principal today.
 * Returns null when the payment does not even cover the interest (the balance would never fall).
 */
export function amortise(
  outstanding: number,
  annualRatePct: number,
  emi: number,
  extraPerMonth = 0,
  lumpSum = 0,
  start = new Date(),
): Amortisation | null {
  let balance = Math.max(0, outstanding - Math.max(0, lumpSum));
  const r = annualRatePct / 12 / 100;
  const payment = emi + Math.max(0, extraPerMonth);
  if (balance > 0 && payment <= balance * r) return null;
  const rows: AmortRow[] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let m = 0;
  let d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (balance > 0.5 && m < MAX_MONTHS) {
    m++;
    const interest = balance * r;
    const principal = Math.min(balance, payment - interest);
    balance -= principal;
    totalInterest += interest;
    totalPaid += interest + principal;
    rows.push({
      month: m,
      on: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      payment: interest + principal,
      interest,
      principal,
      balance: Math.max(0, balance),
    });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  const byYearMap = new Map<string, YearSlice>();
  for (const row of rows) {
    const y = row.on.slice(0, 4);
    const s = byYearMap.get(y) ?? { year: y, interest: 0, principal: 0 };
    s.interest += row.interest;
    s.principal += row.principal;
    byYearMap.set(y, s);
  }
  const last = rows[rows.length - 1];
  const debtFreeOn = last ? new Date(`${last.on}-01T00:00:00`) : new Date(start);
  return {
    rows,
    months: rows.length,
    totalInterest,
    totalPaid: totalPaid + Math.max(0, lumpSum),
    debtFreeOn,
    byYear: [...byYearMap.values()],
  };
}

export interface PrepaySim {
  base: Amortisation;
  withExtra: Amortisation;
  monthsSaved: number;
  interestSaved: number;
}

/** Compare the loan as-is against paying `extraPerMonth` more and/or a `lumpSum` today. */
export function simulatePrepayment(loan: Loan, extraPerMonth: number, lumpSum: number, today = new Date()): PrepaySim | null {
  const base = amortise(loan.outstanding, loan.rate, loan.emi, 0, 0, today);
  const withExtra = amortise(loan.outstanding, loan.rate, loan.emi, extraPerMonth, lumpSum, today);
  if (!base || !withExtra) return null;
  return {
    base,
    withExtra,
    monthsSaved: base.months - withExtra.months,
    interestSaved: base.totalInterest - withExtra.totalInterest,
  };
}

/** "3 yr 2 mo", "11 mo". */
export function humanMonths(n: number): string {
  const y = Math.floor(n / 12);
  const m = n % 12;
  if (y === 0) return `${m} mo`;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}
