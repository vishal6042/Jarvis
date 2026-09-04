import type { Transaction } from "@/types";
import { isRealFlow } from "@/lib/forecast";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Typical monthly net saving = median over the last three complete months of
 * (income into savings) − (all real spending, from savings or on cards).
 */
export function monthlyNetSaving(txns: Transaction[], today = new Date()): { amount: number; basis: number } {
  const nets: number[] = [];
  for (let back = 1; back <= 3; back++) {
    const key = monthKey(new Date(today.getFullYear(), today.getMonth() - back, 1));
    let inflow = 0;
    let outflow = 0;
    let any = false;
    for (const t of txns) {
      if (!t.occurredAt.startsWith(key) || !isRealFlow(t)) continue;
      any = true;
      const onCard = /card|amazon pay/i.test(t.accountName ?? "");
      if (t.direction === "CREDIT" && !onCard) inflow += t.amount;
      if (t.direction === "DEBIT") outflow += t.amount;
    }
    if (any) nets.push(inflow - outflow);
  }
  if (nets.length === 0) return { amount: 0, basis: 0 };
  const s = [...nets].sort((a, b) => a - b);
  return { amount: s[Math.floor(s.length / 2)], basis: nets.length };
}

export interface Scenario {
  id: string;
  label: string;
  /** Change to the monthly net saving (spend less = positive). */
  monthlyDelta?: number;
  /** One-off amount applied in `oneOffMonth` (1 = next month). Negative = outflow. */
  oneOff?: number;
  oneOffMonth?: number;
}

export interface ProjectionPoint {
  month: string; // yyyy-MM
  label: string; // "Sep 26"
  value: number;
}

const label = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/** Month-by-month net-worth path for the next `months` months, from a starting value and a monthly net. */
export function projectNetWorth(
  start: number,
  monthlyNet: number,
  scenarios: Scenario[],
  months = 12,
  today = new Date(),
): ProjectionPoint[] {
  const delta = scenarios.reduce((s, sc) => s + (sc.monthlyDelta ?? 0), 0);
  const out: ProjectionPoint[] = [];
  let v = start;
  for (let m = 1; m <= months; m++) {
    v += monthlyNet + delta;
    for (const sc of scenarios) {
      if (sc.oneOff && (sc.oneOffMonth ?? 1) === m) v += sc.oneOff;
    }
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    out.push({ month: monthKey(d), label: label(d), value: Math.round(v) });
  }
  return out;
}

/** When a goal is reached at the current pace, or null if the pace is zero/negative. */
export function goalEta(remaining: number, monthlyNet: number, today = new Date()): { months: number; on: Date } | null {
  if (remaining <= 0) return { months: 0, on: today };
  if (monthlyNet <= 0) return null;
  const months = Math.ceil(remaining / monthlyNet);
  return { months, on: new Date(today.getFullYear(), today.getMonth() + months, 1) };
}

export const SCENARIO_PRESETS: Scenario[] = [
  { id: "spend-less", label: "Spend ₹10K less / month", monthlyDelta: 10_000 },
  { id: "spend-more", label: "Spend ₹10K more / month", monthlyDelta: -10_000 },
  { id: "buy-1l", label: "₹1L purchase next month", oneOff: -100_000, oneOffMonth: 1 },
  { id: "buy-5l", label: "₹5L purchase in 3 months", oneOff: -500_000, oneOffMonth: 3 },
  { id: "bonus", label: "₹2L bonus in 2 months", oneOff: 200_000, oneOffMonth: 2 },
];
