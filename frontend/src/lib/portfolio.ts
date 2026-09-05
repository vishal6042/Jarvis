import type { Investment, InvestmentKind } from "@/lib/sample";

/**
 * Portfolio analytics over the holdings the user has entered. Everything here is derived from
 * the amount invested, the current value and the dates — no market data and no invented history.
 */

/** How an Indian household actually thinks about these buckets. */
export type AssetClass = "MARKET" | "DEPOSITS" | "SMALL_SAVINGS";

export const ASSET_CLASS_META: Record<AssetClass, { label: string; color: string; note: string }> = {
  MARKET: { label: "Market-linked", color: "#6366f1", note: "Mutual funds, SIPs and NPS — returns move with the market" },
  DEPOSITS: { label: "Bank deposits", color: "#10b981", note: "Fixed and recurring deposits at a contracted rate" },
  SMALL_SAVINGS: { label: "Small savings", color: "#f59e0b", note: "PPF, EPF, NSC, KVP and Sukanya Samriddhi" },
};

const CLASS_OF: Record<InvestmentKind, AssetClass> = {
  MF: "MARKET",
  NPS: "MARKET",
  FD: "DEPOSITS",
  RD: "DEPOSITS",
  PPF: "SMALL_SAVINGS",
  PF: "SMALL_SAVINGS",
  NSC: "SMALL_SAVINGS",
  KVP: "SMALL_SAVINGS",
  SSY: "SMALL_SAVINGS",
};

export const assetClassOf = (kind: InvestmentKind): AssetClass => CLASS_OF[kind];

export interface AllocationSlice {
  cls: AssetClass;
  label: string;
  color: string;
  value: number; // current value
  invested: number;
  pct: number; // share of the portfolio's current value
  count: number;
}

/** Current value split by asset class, largest first. */
export function allocation(investments: Investment[]): AllocationSlice[] {
  const total = investments.reduce((s, i) => s + i.current, 0);
  const map = new Map<AssetClass, AllocationSlice>();
  for (const inv of investments) {
    const cls = assetClassOf(inv.kind);
    const slice = map.get(cls) ?? {
      cls,
      label: ASSET_CLASS_META[cls].label,
      color: ASSET_CLASS_META[cls].color,
      value: 0,
      invested: 0,
      pct: 0,
      count: 0,
    };
    slice.value += inv.current;
    slice.invested += inv.principal;
    slice.count++;
    map.set(cls, slice);
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

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

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

/** Cash flows implied by one holding: monthly instalments for a SIP/RD, else one lump sum. */
export function flowsFor(inv: Investment, today = new Date()): CashFlow[] {
  const start = inv.commencementDate ?? inv.openingDate;
  if (!start) return [];
  const from = new Date(`${start}T00:00:00`);
  if (from > today) return [];
  const flows: CashFlow[] = [];
  const sip = inv.sip ?? 0;

  if (sip > 0) {
    const monthsElapsed = Math.max(
      1,
      (today.getFullYear() - from.getFullYear()) * 12 + (today.getMonth() - from.getMonth()) + 1,
    );
    // Instalments cannot exceed what was actually put in; anything above them is money that was
    // already there when tracking began (a transferred-in EPF balance, say) and counts at the start.
    const instalments = Math.max(1, Math.min(monthsElapsed, Math.round(inv.principal / sip)));
    const opening = Math.max(0, inv.principal - sip * instalments);
    if (opening > 0) flows.push({ on: from, amount: -opening });
    let d = new Date(from);
    for (let n = 0; n < instalments && d <= today; n++) {
      flows.push({ on: new Date(d), amount: -sip });
      d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (flows.length === 0) return [];
  } else {
    flows.push({ on: from, amount: -inv.principal });
  }
  flows.push({ on: today, amount: inv.current });
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
}

export function holdingReturn(inv: Investment, today = new Date()): HoldingReturn {
  const gain = inv.current - inv.principal;
  const gainPct = inv.principal > 0 ? (gain / inv.principal) * 100 : 0;
  const flows = flowsFor(inv, today);
  const rate = flows.length ? xirr(flows) : null;
  const start = inv.commencementDate ?? inv.openingDate;
  const years = start ? (today.getTime() - new Date(`${start}T00:00:00`).getTime()) / YEAR_MS : null;
  return { inv, gain, gainPct, annualised: rate != null ? rate * 100 : null, years };
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
  const current = investments.reduce((s, i) => s + i.current, 0);
  const all: CashFlow[] = [];
  for (const inv of investments) all.push(...flowsFor(inv, today));
  const rate = all.length ? xirr(all) : null;
  return {
    invested,
    current,
    gain: current - invested,
    gainPct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    annualised: rate != null ? rate * 100 : null,
    monthlyCommitment: investments.reduce((s, i) => s + (i.sip ?? 0), 0),
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
      const d = new Date(`${i.maturityDate}T00:00:00`);
      const monthsAway = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
      return { inv: i, on: i.maturityDate as string, monthsAway };
    })
    .sort((a, b) => a.monthsAway - b.monthsAway);
}
