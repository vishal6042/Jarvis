import type { Transaction } from "@/types";
import type { Period } from "@/lib/sample";
import { periodWindow } from "@/lib/txnseries";

/** Real household spend: card + savings debits, minus self-transfers and card bill settlements. */
export const isRealSpend = (t: Transaction) => t.direction === "DEBIT" && !t.transfer && !t.settlement;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ---------------------------------------------------------------------------------------------
// Period comparison
// ---------------------------------------------------------------------------------------------
export interface NamedValue {
  name: string;
  value: number;
}

export interface CompareRow {
  name: string;
  now: number;
  prev: number;
  delta: number; // now - prev
  pct: number | null; // % change vs prev, null when prev is 0
}

export interface Comparison {
  rows: CompareRow[];
  totalNow: number;
  totalPrev: number;
  delta: number;
  pct: number | null;
}

/** Category totals for this period vs the previous one, biggest absolute movers first. */
export function compareCategories(now: NamedValue[], prev: NamedValue[]): Comparison {
  const map = new Map<string, CompareRow>();
  for (const c of now) map.set(c.name, { name: c.name, now: c.value, prev: 0, delta: 0, pct: null });
  for (const c of prev) {
    const r = map.get(c.name) ?? { name: c.name, now: 0, prev: 0, delta: 0, pct: null };
    r.prev = c.value;
    map.set(c.name, r);
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    delta: r.now - r.prev,
    pct: r.prev > 0 ? Math.round(((r.now - r.prev) / r.prev) * 100) : null,
  }));
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const totalNow = now.reduce((s, c) => s + c.value, 0);
  const totalPrev = prev.reduce((s, c) => s + c.value, 0);
  return {
    rows,
    totalNow,
    totalPrev,
    delta: totalNow - totalPrev,
    pct: totalPrev > 0 ? Math.round(((totalNow - totalPrev) / totalPrev) * 100) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Spending behaviour
// ---------------------------------------------------------------------------------------------
export interface Behaviour {
  count: number;
  total: number;
  avg: number;
  median: number;
  weekdayTotal: number;
  weekendTotal: number;
  weekdayPerDay: number;
  weekendPerDay: number;
  byDow: { label: string; total: number; count: number }[];
  busiest: { label: string; total: number } | null;
  largest: Transaction | null;
  smallShare: number; // % of transactions under ₹500
  smallTotalShare: number; // % of money in those small transactions
  activeDays: number;
  daysInWindow: number;
}

/** How you spend (not just what on) within the selected window. */
export function spendingBehaviour(txns: Transaction[], period: Period, offset = 0): Behaviour | null {
  const { from, to } = periodWindow(period, offset);
  const end = to > new Date() ? new Date() : to;
  const rows = txns.filter((t) => {
    if (!isRealSpend(t)) return false;
    const d = new Date(t.occurredAt);
    return d >= from && d <= to;
  });
  if (rows.length === 0) return null;
  const byDow = DOW.map((label) => ({ label, total: 0, count: 0 }));
  const days = new Set<string>();
  let weekdayTotal = 0;
  let weekendTotal = 0;
  let weekdayDays = 0;
  let weekendDays = 0;
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) weekendDays++;
    else weekdayDays++;
  }
  let largest: Transaction | null = null;
  let small = 0;
  let smallTotal = 0;
  for (const t of rows) {
    const d = new Date(t.occurredAt);
    const dow = d.getDay();
    byDow[dow].total += t.amount;
    byDow[dow].count++;
    if (dow === 0 || dow === 6) weekendTotal += t.amount;
    else weekdayTotal += t.amount;
    days.add(t.occurredAt.slice(0, 10));
    if (!largest || t.amount > largest.amount) largest = t;
    if (t.amount < 500) {
      small++;
      smallTotal += t.amount;
    }
  }
  const total = rows.reduce((s, t) => s + t.amount, 0);
  const busiestRow = byDow.reduce((a, b) => (b.total > a.total ? b : a));
  return {
    count: rows.length,
    total,
    avg: total / rows.length,
    median: median(rows.map((t) => t.amount)),
    weekdayTotal,
    weekendTotal,
    weekdayPerDay: weekdayDays ? weekdayTotal / weekdayDays : 0,
    weekendPerDay: weekendDays ? weekendTotal / weekendDays : 0,
    byDow,
    busiest: busiestRow.total > 0 ? { label: busiestRow.label, total: busiestRow.total } : null,
    largest,
    smallShare: Math.round((small / rows.length) * 100),
    smallTotalShare: total ? Math.round((smallTotal / total) * 100) : 0,
    activeDays: days.size,
    daysInWindow: weekdayDays + weekendDays,
  };
}

// ---------------------------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------------------------
export interface BudgetRow {
  category: string;
  budget: number;
  actual: number;
  pct: number; // actual / budget, capped at 999
  state: "ok" | "warn" | "over";
}

/** Monthly category budgets (thresholds) against this period's actuals. */
export function budgetVsActual(budgets: Record<string, number>, actual: NamedValue[]): BudgetRow[] {
  const rows: BudgetRow[] = [];
  for (const [category, budget] of Object.entries(budgets)) {
    if (!budget || budget <= 0) continue;
    const a = actual.find((x) => x.name === category)?.value ?? 0;
    const pct = Math.min(999, Math.round((a / budget) * 100));
    rows.push({ category, budget, actual: a, pct, state: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok" });
  }
  return rows.sort((x, y) => y.pct - x.pct);
}

// ---------------------------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------------------------
export type AnomalyKind = "large-txn" | "category-spike" | "new-merchant";

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  title: string;
  detail: string;
  amount: number;
  severity: "amber" | "red";
  href?: string;
  on: string; // yyyy-MM-dd
}

/**
 * Things worth a second look, all relative to the user's own history:
 *  - a transaction far above the usual size for its category (last 90 days),
 *  - a category running well above its 3-month average this month,
 *  - a sizeable payment to a merchant never seen before.
 */
export function detectAnomalies(txns: Transaction[], today = new Date()): Anomaly[] {
  const spend = txns.filter(isRealSpend);
  const out: Anomaly[] = [];
  const dayMs = 86_400_000;
  const since30 = new Date(today.getTime() - 30 * dayMs);
  const since90 = new Date(today.getTime() - 90 * dayMs);
  const thisMonth = monthKey(today);

  // Large single transactions vs category median.
  const byCat = new Map<string, Transaction[]>();
  for (const t of spend) {
    const d = new Date(t.occurredAt);
    if (d < since90) continue;
    const c = t.category ?? "Uncategorized";
    (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(t);
  }
  for (const [cat, rows] of byCat) {
    if (rows.length < 4) continue;
    for (const t of rows) {
      if (new Date(t.occurredAt) < since30) continue;
      const others = rows.filter((o) => o.id !== t.id).map((o) => o.amount);
      const med = median(others);
      if (med <= 0) continue;
      const ratio = t.amount / med;
      if (t.amount >= 2000 && ratio >= 3) {
        out.push({
          id: `large-${t.id}`,
          kind: "large-txn",
          title: `${t.merchant ?? cat} · ${Math.round(ratio)}× your usual ${cat.toLowerCase()} spend`,
          detail: `Typical ${cat.toLowerCase()} transaction is about ${Math.round(med).toLocaleString("en-IN")}`,
          amount: t.amount,
          severity: ratio >= 5 ? "red" : "amber",
          href: `/transactions?q=${encodeURIComponent(t.merchant ?? "")}`,
          on: t.occurredAt.slice(0, 10),
        });
      }
    }
  }

  // Category spikes: this month vs the average of the previous three months that had spend.
  const monthCat = new Map<string, Map<string, number>>();
  for (const t of spend) {
    const d = new Date(t.occurredAt);
    const mk = monthKey(d);
    const c = t.category ?? "Uncategorized";
    const m = monthCat.get(mk) ?? monthCat.set(mk, new Map()).get(mk)!;
    m.set(c, (m.get(c) ?? 0) + t.amount);
  }
  const prevKeys = [1, 2, 3].map((back) => monthKey(new Date(today.getFullYear(), today.getMonth() - back, 1)));
  const cur = monthCat.get(thisMonth) ?? new Map<string, number>();
  for (const [cat, now] of cur) {
    const prevVals = prevKeys.map((k) => monthCat.get(k)?.get(cat) ?? 0).filter((v) => v > 0);
    if (prevVals.length < 2) continue;
    const avg = prevVals.reduce((s, v) => s + v, 0) / prevVals.length;
    const ratio = now / avg;
    if (now >= 2000 && ratio >= 1.5) {
      out.push({
        id: `spike-${cat}`,
        kind: "category-spike",
        title: `${cat} is ${Math.round((ratio - 1) * 100)}% above your 3-month average`,
        detail: `${Math.round(now).toLocaleString("en-IN")} so far this month vs ~${Math.round(avg).toLocaleString("en-IN")} usually`,
        amount: now - avg,
        severity: ratio >= 2 ? "red" : "amber",
        href: `/transactions?month=${thisMonth}&category=${encodeURIComponent(cat)}`,
        on: today.toISOString().slice(0, 10),
      });
    }
  }

  // New merchants with a sizeable first payment.
  const firstSeen = new Map<string, Transaction>();
  const seenCount = new Map<string, number>();
  for (const t of [...spend].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))) {
    const m = (t.merchant ?? "").trim().toLowerCase();
    if (!m) continue;
    if (!firstSeen.has(m)) firstSeen.set(m, t);
    seenCount.set(m, (seenCount.get(m) ?? 0) + 1);
  }
  for (const [m, t] of firstSeen) {
    if (new Date(t.occurredAt) < since30 || t.amount < 5000 || (seenCount.get(m) ?? 0) > 1) continue;
    out.push({
      id: `new-${t.id}`,
      kind: "new-merchant",
      title: `First payment to ${t.merchant}`,
      detail: `${t.category ?? "Uncategorized"} · ${t.accountName ?? "unknown account"}`,
      amount: t.amount,
      severity: "amber",
      href: `/transactions?q=${encodeURIComponent(t.merchant ?? "")}`,
      on: t.occurredAt.slice(0, 10),
    });
  }

  const rank = { red: 0, amber: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.amount - a.amount).slice(0, 8);
}

// ---------------------------------------------------------------------------------------------
// Monthly series (spending / income / cash flow over time)
// ---------------------------------------------------------------------------------------------
export interface MonthPoint {
  month: string; // yyyy-MM
  label: string; // "Sep"
  spend: number;
  income: number;
  net: number; // income − spend
}

/** Is this a credit into a savings account (real income, not a card refund or a shuffle)? */
const isIncome = (t: Transaction) =>
  t.direction === "CREDIT" && !t.transfer && !t.settlement && t.accountName != null && !/card/i.test(t.accountName);

/** The last `months` calendar months of real spend, income and the difference. */
export function monthlySeries(txns: Transaction[], months = 12, today = new Date()): MonthPoint[] {
  const out: MonthPoint[] = [];
  const index = new Map<string, MonthPoint>();
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const point: MonthPoint = { month: key, label: d.toLocaleString("en-IN", { month: "short" }), spend: 0, income: 0, net: 0 };
    out.push(point);
    index.set(key, point);
  }
  for (const t of txns) {
    const point = index.get(t.occurredAt.slice(0, 7));
    if (!point) continue;
    if (isRealSpend(t)) point.spend += t.amount;
    else if (isIncome(t)) point.income += t.amount;
  }
  for (const p of out) {
    p.spend = Math.round(p.spend);
    p.income = Math.round(p.income);
    p.net = p.income - p.spend;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Recurring intelligence
// ---------------------------------------------------------------------------------------------
export interface RecurringInsight {
  merchant: string;
  category: string | null;
  cadence: string;
  amount: number; // latest amount
  monthlyEstimate: number;
  yearlyCost: number;
  nextExpected: string;
  occurrences: number;
  /** Earliest observed amount, when there is more than one charge to compare. */
  firstAmount: number | null;
  changePct: number | null; // latest vs earliest
  /** Days past the expected date; positive means it has not arrived when it should have. */
  overdueDays: number;
}

export interface RecurringSummary {
  items: RecurringInsight[];
  monthlyTotal: number;
  yearlyTotal: number;
  increased: RecurringInsight[];
  stale: RecurringInsight[];
}

interface RecurringLike {
  merchant: string | null;
  category: string | null;
  amount: number;
  cadence: string;
  nextExpected: string;
  occurrences: number;
  monthlyEstimate: number;
}

/**
 * Enrich detected recurring payments with what the transaction history says about them: has the
 * price moved, what does it cost a year, and has a charge stopped arriving.
 */
export function recurringIntelligence(
  recurring: RecurringLike[],
  txns: Transaction[],
  today = new Date(),
): RecurringSummary {
  const spend = txns.filter(isRealSpend);
  const items: RecurringInsight[] = [];
  for (const r of recurring) {
    const merchant = (r.merchant ?? "").trim();
    if (!merchant) continue;
    const needle = merchant.toLowerCase();
    const mine = spend
      .filter((t) => (t.merchant ?? "").trim().toLowerCase() === needle)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
    const firstAmount = mine.length > 1 ? mine[0].amount : null;
    const latest = mine.length > 0 ? mine[mine.length - 1].amount : r.amount;
    const changePct = firstAmount && firstAmount > 0 ? Math.round(((latest - firstAmount) / firstAmount) * 100) : null;
    const due = new Date(`${r.nextExpected}T00:00:00`);
    const overdueDays = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    items.push({
      merchant,
      category: r.category,
      cadence: r.cadence,
      amount: latest,
      monthlyEstimate: r.monthlyEstimate,
      yearlyCost: Math.round(r.monthlyEstimate * 12),
      nextExpected: r.nextExpected,
      occurrences: r.occurrences,
      firstAmount,
      changePct,
      overdueDays,
    });
  }
  items.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
  return {
    items,
    monthlyTotal: Math.round(items.reduce((s, i) => s + i.monthlyEstimate, 0)),
    yearlyTotal: Math.round(items.reduce((s, i) => s + i.yearlyCost, 0)),
    // A rise of more than 5% is worth knowing about; rounding noise is not.
    increased: items.filter((i) => i.changePct != null && i.changePct > 5),
    // Nothing for more than a fortnight past the expected date: cancelled, or a charge that failed.
    stale: items.filter((i) => i.overdueDays > 14),
  };
}
