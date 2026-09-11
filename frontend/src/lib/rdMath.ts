import type { Investment } from "@/lib/sample";

/**
 * Recurring-deposit arithmetic as used by India Post / banks (mirrors finance-service RdMath):
 * fixed monthly instalment, interest compounded quarterly.
 * M = R × ((1 + i)^n − 1) / (1 − (1 + i)^(−1/3)), i = quarterly rate, n = months / 3.
 */
export function rdAccruedValue(instalment: number, months: number, annualRatePct: number): number {
  if (instalment <= 0 || months <= 0) return 0;
  const deposits = instalment * months;
  if (annualRatePct <= 0) return deposits;
  const i = annualRatePct / 400;
  const n = months / 3;
  const factor = (Math.pow(1 + i, n) - 1) / (1 - Math.pow(1 + i, -1 / 3));
  return Math.max(deposits, Math.round(instalment * factor * 100) / 100);
}

/** Fixed deposit with quarterly compounding. */
export function fdMaturityValue(principal: number, years: number, annualRatePct: number): number {
  if (principal <= 0 || years <= 0) return principal;
  return Math.round(principal * Math.pow(1 + annualRatePct / 400, 4 * years) * 100) / 100;
}

export function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1));
}

/** Yearly rise assumed in EPF contributions as salary grows - the figure used in EPFO's own calculator. */
export const EPF_YEARLY_RAISE = 0.1;

/**
 * An EPF balance carried forward month by month: the contribution (employee + employer EPF share) is
 * paid in, interest accrues on the running balance at rate/12 and is credited every 12 months, the way
 * EPFO credits it once a year, and the contribution rises by EPF_YEARLY_RAISE each year.
 */
export function epfFutureValue(balance: number, monthly: number, months: number, annualRatePct: number) {
  let value = balance;
  let contributions = 0;
  let interest = 0;
  let accrued = 0;
  let instalment = monthly;
  for (let m = 1; m <= months; m++) {
    value += instalment;
    contributions += instalment;
    accrued += (value * annualRatePct) / 1200;
    if (m % 12 === 0 || m === months) {
      value += accrued;
      interest += accrued;
      accrued = 0;
    }
    if (m % 12 === 0) instalment *= 1 + EPF_YEARLY_RAISE;
  }
  return { value, contributions, interest };
}

export interface MaturityProjection {
  maturityOn: string;
  totalMonths: number;
  monthsDone: number;
  monthsLeft: number;
  deposited: number; // so far
  totalDeposits: number; // by maturity
  maturityValue: number;
  interestEarned: number; // at maturity
  valueNow: number; // accrued so far
  /** EPF only: what is still to be paid in, and the interest still to be credited, from today. */
  contributionsToCome?: number;
  interestToCome?: number;
}

/**
 * Where an RD or FD will end up at maturity, from its own terms, or an EPF balance at retirement.
 * Null when the terms are incomplete.
 */
export function maturityProjection(inv: Investment, today = new Date()): MaturityProjection | null {
  const rate = inv.rate ?? 0;
  if (inv.kind === "PF") {
    // EPF matures at 58: carry today's balance forward rather than work from the account's opening terms.
    if (!inv.maturityDate) return null;
    const todayStr = today.toISOString().slice(0, 10);
    const monthsLeft = monthsBetween(todayStr, inv.maturityDate);
    if (monthsLeft <= 0) return null;
    const monthsDone = monthsBetween(inv.commencementDate ?? inv.openingDate ?? todayStr, todayStr);
    const fv = epfFutureValue(inv.current, inv.sip ?? 0, monthsLeft, rate);
    return {
      maturityOn: inv.maturityDate,
      totalMonths: monthsDone + monthsLeft,
      monthsDone,
      monthsLeft,
      deposited: inv.principal,
      totalDeposits: inv.principal + fv.contributions,
      maturityValue: fv.value,
      interestEarned: fv.value - inv.principal - fv.contributions,
      valueNow: inv.current,
      contributionsToCome: fv.contributions,
      interestToCome: fv.interest,
    };
  }
  const start = inv.commencementDate ?? inv.openingDate;
  if (!inv.maturityDate || !start) return null;
  const todayStr = today.toISOString().slice(0, 10);
  const totalMonths = monthsBetween(start, inv.maturityDate);
  if (totalMonths <= 0) return null;
  const monthsDone = Math.min(totalMonths, monthsBetween(start, todayStr) + 1);

  if (inv.kind === "RD" && inv.sip && inv.sip > 0) {
    const maturityValue = rdAccruedValue(inv.sip, totalMonths, rate);
    return {
      maturityOn: inv.maturityDate,
      totalMonths,
      monthsDone,
      monthsLeft: totalMonths - monthsDone,
      deposited: inv.sip * monthsDone,
      totalDeposits: inv.sip * totalMonths,
      maturityValue,
      interestEarned: maturityValue - inv.sip * totalMonths,
      valueNow: rdAccruedValue(inv.sip, monthsDone, rate),
    };
  }
  if ((inv.kind === "FD" || inv.kind === "NSC" || inv.kind === "KVP") && inv.principal > 0 && rate > 0) {
    const maturityValue = fdMaturityValue(inv.principal, totalMonths / 12, rate);
    return {
      maturityOn: inv.maturityDate,
      totalMonths,
      monthsDone,
      monthsLeft: totalMonths - monthsDone,
      deposited: inv.principal,
      totalDeposits: inv.principal,
      maturityValue,
      interestEarned: maturityValue - inv.principal,
      valueNow: fdMaturityValue(inv.principal, monthsDone / 12, rate),
    };
  }
  return null;
}
