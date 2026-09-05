import type { Transaction } from "@/types";
import { isRealFlow } from "@/lib/forecast";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export interface CategoryRow {
  category: string;
  total: number;
  share: number; // 0..1 of this month's spend
  avg6: number; // average over the previous 6 complete months
  deltaPct: number | null; // vs avg6, null when no history
}

export interface MonthBreakdown {
  month: string; // yyyy-MM
  total: number;
  lastMonthTotal: number;
  rows: CategoryRow[];
  /** Categories well above their average, biggest excess first — the "why". */
  movers: { category: string; excess: number; deltaPct: number }[];
}

/** Spend (real outflows only) per category for one yyyy-MM. */
export function categoryTotals(txns: Transaction[], month: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "DEBIT" || !isRealFlow(t) || !t.occurredAt.startsWith(month)) continue;
    const k = t.category ?? "Uncategorized";
    m.set(k, (m.get(k) ?? 0) + t.amount);
  }
  return m;
}

/** This month's spend by category, with each category compared to its 6-month average. */
export function currentMonthBreakdown(txns: Transaction[], today = new Date()): MonthBreakdown {
  const month = monthKey(today);
  const last = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const now = categoryTotals(txns, month);
  const lastMonth = categoryTotals(txns, last);

  // Previous 6 complete months → per-category average (months with no spend count as 0).
  const history = new Map<string, number>();
  let monthsWithData = 0;
  for (let back = 1; back <= 6; back++) {
    const key = monthKey(new Date(today.getFullYear(), today.getMonth() - back, 1));
    const totals = categoryTotals(txns, key);
    if (totals.size > 0) monthsWithData++;
    for (const [k, v] of totals) history.set(k, (history.get(k) ?? 0) + v);
  }
  const divisor = Math.max(1, monthsWithData);

  const total = Array.from(now.values()).reduce((s, v) => s + v, 0);
  const rows: CategoryRow[] = Array.from(now.entries())
    .map(([category, t]) => {
      const avg6 = (history.get(category) ?? 0) / divisor;
      return {
        category,
        total: t,
        share: total > 0 ? t / total : 0,
        avg6,
        deltaPct: avg6 > 0 ? ((t - avg6) / avg6) * 100 : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const movers = rows
    .filter((r) => r.deltaPct != null && r.deltaPct >= 30 && r.total - r.avg6 >= 2000)
    .map((r) => ({ category: r.category, excess: r.total - r.avg6, deltaPct: r.deltaPct as number }))
    .sort((a, b) => b.excess - a.excess)
    .slice(0, 3);

  return {
    month,
    total,
    lastMonthTotal: Array.from(lastMonth.values()).reduce((s, v) => s + v, 0),
    rows,
    movers,
  };
}

/** Top merchants for a set of transactions (real outflows only). */
export function merchantTotals(txns: Transaction[], limit = 8): { merchant: string; total: number; count: number }[] {
  const m = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== "DEBIT" || !isRealFlow(t)) continue;
    const k = (t.merchantNorm ?? t.merchant ?? "").trim() || "Unknown merchant";
    const cur = m.get(k) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    m.set(k, cur);
  }
  return Array.from(m.entries())
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Spend split by how it was paid: card vs bank account vs unknown. */
export function paymentMethodTotals(txns: Transaction[]): { method: string; total: number }[] {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "DEBIT" || !isRealFlow(t)) continue;
    const name = t.accountName ?? "";
    const method = !name ? "Unlinked" : /card|amazon pay/i.test(name) ? "Credit cards" : "Bank accounts";
    m.set(method, (m.get(method) ?? 0) + t.amount);
  }
  return Array.from(m.entries())
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => b.total - a.total);
}
