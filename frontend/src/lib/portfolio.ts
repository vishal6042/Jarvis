import { KIND_META, type Investment, type InvestmentKind } from "@/lib/sample";
import { maturityProjection, monthsBetween, rdAccruedValue } from "@/lib/rdMath";

/**
 * Portfolio analytics over the holdings the user has entered. Everything here is derived from
 * the amount invested, the current value and the dates — no market data and no invented history.
 */

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const at = (iso: string) => new Date(`${iso}T00:00:00`);

// ---------------------------------------------------------------------------------------------
// Value today
// ---------------------------------------------------------------------------------------------

export interface ValueToday {
  value: number;
  /** True when the value is Jarvis's estimate of interest accrued, not a figure the user entered. */
  accrued: boolean;
  rate?: number;
  /** yyyy-MM-dd the interest is counted from. */
  since?: string;
}

/**
 * What a holding is worth today. Usually the stored current value; but a fixed deposit is entered
 * at its principal and nobody updates it, so it would read "₹0 gain" for its whole life. When an
 * FD still shows current == principal and has a rate and an opening date, the interest accrued so
 * far is worked out instead — quarterly compounding, the way Indian banks credit it — and flagged
 * so the page can mark it "≈".
 */
export function valueToday(inv: Investment, today = new Date()): ValueToday {
  const since = inv.openingDate ?? inv.commencementDate;
  if (inv.kind !== "FD" || inv.current !== inv.principal || !inv.rate || inv.rate <= 0 || !since || inv.principal <= 0) {
    return { value: inv.current, accrued: false };
  }
  const from = at(since);
  // Interest stops at maturity; after that the deposit is simply owed back at its maturity value.
  const until = inv.maturityDate && at(inv.maturityDate) < today ? at(inv.maturityDate) : today;
  const years = (until.getTime() - from.getTime()) / YEAR_MS;
  if (years <= 0) return { value: inv.current, accrued: false };
  const value = Math.round(inv.principal * Math.pow(1 + inv.rate / 100 / 4, 4 * years));
  return value > inv.principal ? { value, accrued: true, rate: inv.rate, since } : { value: inv.current, accrued: false };
}

/** The value today of each holding, summed. */
export const totalValue = (investments: Investment[], today = new Date()) =>
  investments.reduce((s, i) => s + valueToday(i, today).value, 0);

/** A yearly premium as its monthly share, so a total means one month of money. */
export const monthlyEquivalent = (inv: Investment) => (inv.sip ?? 0) / (inv.contributionFrequency === "yearly" ? 12 : 1);

/** Products with a fixed or declared return, against those whose value moves with the market. */
export const FIXED_RETURN_KINDS: InvestmentKind[] = ["PF", "PPF", "FD", "RD", "LIC", "NSC", "KVP", "SSY"];
export const MARKET_LINKED_KINDS: InvestmentKind[] = ["NPS", "MF"];

// ---------------------------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------------------------

export interface KindSlice {
  kind: InvestmentKind;
  label: string;
  color: string;
  value: number; // value today
  invested: number;
  pct: number; // share of the portfolio's value today
  count: number;
}

/**
 * Value today split by the actual product — fixed deposits, LIC, EPF — largest first.
 *
 * The broad classes above answer "how exposed am I to the market"; this answers "what do I
 * actually hold", which is the question someone looking at their own portfolio is usually asking.
 */
export function allocationByKind(investments: Investment[]): KindSlice[] {
  const total = totalValue(investments);
  const map = new Map<InvestmentKind, KindSlice>();
  for (const inv of investments) {
    const slice = map.get(inv.kind) ?? {
      kind: inv.kind,
      label: KIND_META[inv.kind].label,
      color: KIND_META[inv.kind].color,
      value: 0,
      invested: 0,
      pct: 0,
      count: 0,
    };
    slice.value += valueToday(inv).value;
    slice.invested += inv.principal;
    slice.count++;
    map.set(inv.kind, slice);
  }
  return [...map.values()]
    .map((s) => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------------------------

export interface CashFlow {
  on: Date;
  /** Negative when money goes in, positive when it comes back (the current value counts as a return). */
  amount: number;
}

const npv = (flows: CashFlow[], rate: number, t0: number) =>
  flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.on.getTime() - t0) / YEAR_MS), 0);

/**
 * Annualised return of an irregular series of cash flows (the same idea as a spreadsheet's XIRR).
 * Bisection on [-0.95, 10]: slower than Newton but it cannot diverge, which matters because these
 * series are short and often lopsided. Returns null when the flows have no sign change.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.on.getTime() - b.on.getTime());
  const t0 = sorted[0].on.getTime();
  const hasIn = sorted.some((f) => f.amount < 0);
  const hasOut = sorted.some((f) => f.amount > 0);
  if (!hasIn || !hasOut) return null;

  let lo = -0.95;
  let hi = 10;
  let fLo = npv(sorted, lo, t0);
  let fHi = npv(sorted, hi, t0);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(sorted, mid, t0);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export interface SipSchedule {
  /** When tracking began: the commencement or opening date, or the first assumed instalment. */
  from: Date;
  /** Instalments assumed paid, oldest first. */
  dates: Date[];
  /** Money already there when the instalments began (a transferred-in EPF balance, say). */
  opening: number;
  /** True when the instalments assumed cover much less time than the account has been open. */
  compressed: boolean;
}

/**
 * The instalments Jarvis assumes a SIP-style holding (RD, SIP, EPF, a yearly LIC premium) was paid
 * in, when all it knows is the total put in and today's instalment.
 *
 * The total put in divided by the instalment gives how many instalments there were; they are
 * placed in the most recent periods, ending at the last one counted in (or today). Placing them
 * from the start date instead claimed today's instalment was already being paid years ago, and
 * for an EPF whose contribution has grown with salary that left a decade with too little money in
 * it and reported a return far below the rate EPFO actually credits.
 */
export function sipSchedule(inv: Investment, today = new Date()): SipSchedule | null {
  const sip = inv.sip ?? 0;
  if (sip <= 0) return null;
  const start = inv.commencementDate ?? inv.openingDate;
  const begin = start ? at(start) : null;
  if (begin && begin > today) return null;
  const step = inv.contributionFrequency === "yearly" ? 12 : 1;
  let n = Math.max(1, Math.round(inv.principal / sip));
  if (begin) {
    const monthsElapsed = (today.getFullYear() - begin.getFullYear()) * 12 + (today.getMonth() - begin.getMonth()) + 1;
    // Instalments cannot outnumber the periods the account has been open; anything above them is
    // money that was already there when tracking began and counts at the start.
    n = Math.max(1, Math.min(n, Math.floor(monthsElapsed / step)));
  }
  const lastOn = inv.lastContributionOn ? at(inv.lastContributionOn) : null;
  const last = lastOn && lastOn <= today && (!begin || lastOn >= begin) ? lastOn : today;
  const dates: Date[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(last.getFullYear(), last.getMonth() - k * step, last.getDate());
    dates.push(begin && d < begin ? begin : d);
  }
  const from = begin ?? dates[0];
  const opening = Math.max(0, inv.principal - sip * n);
  const compressed = (dates[0].getTime() - from.getTime()) / YEAR_MS > 1;
  return { from, dates, opening, compressed };
}

/** Cash flows implied by one holding: its instalments for a SIP/RD, else one lump sum; then today's value. */
export function flowsFor(inv: Investment, today = new Date()): CashFlow[] {
  const flows: CashFlow[] = [];
  if ((inv.sip ?? 0) > 0) {
    const schedule = sipSchedule(inv, today);
    if (!schedule) return [];
    if (schedule.opening > 0) flows.push({ on: schedule.from, amount: -schedule.opening });
    for (const d of schedule.dates) flows.push({ on: d, amount: -(inv.sip ?? 0) });
  } else {
    const start = inv.commencementDate ?? inv.openingDate;
    if (!start || at(start) > today) return [];
    flows.push({ on: at(start), amount: -inv.principal });
  }
  flows.push({ on: today, amount: valueToday(inv, today).value });
  return flows;
}

export interface HoldingReturn {
  inv: Investment;
  /** Absolute gain over what went in. */
  gain: number;
  gainPct: number;
  /** Annualised return, null when the dates make it impossible to compute. */
  annualised: number | null;
  years: number | null;
  /**
   * An EPF whose assumed instalments cover much less time than the account has been open: the
   * annualised figure rests on the assumption in {@link sipSchedule}, not on its real history.
   */
  estimated: boolean;
}

export function holdingReturn(inv: Investment, today = new Date()): HoldingReturn {
  const gain = valueToday(inv, today).value - inv.principal;
  const gainPct = inv.principal > 0 ? (gain / inv.principal) * 100 : 0;
  const flows = flowsFor(inv, today);
  const rate = flows.length ? xirr(flows) : null;
  const start = inv.commencementDate ?? inv.openingDate;
  const years = start ? (today.getTime() - at(start).getTime()) / YEAR_MS : null;
  const estimated = inv.kind === "PF" && rate != null && !!sipSchedule(inv, today)?.compressed;
  return { inv, gain, gainPct, annualised: rate != null ? rate * 100 : null, years, estimated };
}

export interface PortfolioReturn {
  invested: number;
  current: number;
  gain: number;
  gainPct: number;
  /** Annualised return across every holding's cash flows combined. */
  annualised: number | null;
  monthlyCommitment: number; // total SIP / RD instalments per month
}

export function portfolioReturn(investments: Investment[], today = new Date()): PortfolioReturn {
  const invested = investments.reduce((s, i) => s + i.principal, 0);
  const current = totalValue(investments, today);
  const all: CashFlow[] = [];
  for (const inv of investments) all.push(...flowsFor(inv, today));
  const rate = all.length ? xirr(all) : null;
  return {
    invested,
    current,
    gain: current - invested,
    gainPct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    annualised: rate != null ? rate * 100 : null,
    // A yearly premium is shown as its monthly equivalent so the total means one month of money.
    monthlyCommitment: investments.reduce((s, i) => s + monthlyEquivalent(i), 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Maturity ladder
// ---------------------------------------------------------------------------------------------

export interface MaturityEntry {
  inv: Investment;
  on: string; // yyyy-MM-dd
  monthsAway: number;
}

/** Holdings with a maturity date, soonest first — when money actually becomes available again. */
export function maturityLadder(investments: Investment[], today = new Date()): MaturityEntry[] {
  return investments
    .filter((i) => !!i.maturityDate)
    .map((i) => {
      const d = at(i.maturityDate as string);
      const monthsAway = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
      return { inv: i, on: i.maturityDate as string, monthsAway };
    })
    .sort((a, b) => a.monthsAway - b.monthsAway);
}

/**
 * What a holding pays out when it matures, from its own terms: an FD's compounded principal, an
 * RD's instalments with interest. An RD whose opening date was never entered is worked out from
 * the instalments already in (total ÷ instalment) plus those still to come. Null when the terms
 * don't say — an LIC policy's bonuses, say — so the caller can fall back to today's value and say so.
 * EPF is left out: its "maturity" is a projection to 58 on assumed pay rises, not a payout.
 */
export function maturityValue(inv: Investment, today = new Date()): number | null {
  if (inv.kind === "PF" || !inv.maturityDate) return null;
  const mp = maturityProjection(inv, today);
  if (mp) return Math.round(mp.maturityValue);
  if (inv.kind === "RD" && inv.sip && inv.sip > 0 && inv.rate) {
    const done = Math.round(inv.principal / inv.sip);
    const left = monthsBetween(today.toISOString().slice(0, 10), inv.maturityDate);
    return Math.round(rdAccruedValue(inv.sip, done + left, inv.rate));
  }
  return null;
}
