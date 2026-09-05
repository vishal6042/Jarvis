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
}

/** Where an RD or FD will end up at maturity, from its own terms. Null when the terms are incomplete. */
export function maturityProjection(inv: Investment, today = new Date()): MaturityProjection | null {
  const rate = inv.rate ?? 0;
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
