import type { Transaction } from "@/types";
import type { Period } from "./sample";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Start/end of the window for a period, shifted back by `offset` whole periods (0 = current).
 * offset 1 = previous day/week/month/year, etc.
 */
export function periodWindow(period: Period, offset = 0): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;
  let to: Date;
  if (period === "day") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59, 999);
  } else if (period === "week") {
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7, 23, 59, 59, 999);
    from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
  } else {
    from = new Date(now.getFullYear() - offset, 0, 1);
    to = new Date(now.getFullYear() - offset, 11, 31, 23, 59, 59, 999);
  }
  return { from, to };
}

/** Human label for the period window (e.g. "July 2026", "29 Jun – 5 Jul", "5 Jul 2026", "2026"). */
export function periodLabel(period: Period, offset = 0): string {
  const { from, to } = periodWindow(period, offset);
  if (period === "day")
    return from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (period === "week") {
    const f = from.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const t = to.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `${f} – ${t}`;
  }
  if (period === "month") return from.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return String(from.getFullYear());
}

function bucketsFor(period: Period, to: Date): { labels: string[]; indexOf: (d: Date) => number } {
  if (period === "day") {
    return { labels: Array.from({ length: 24 }, (_, i) => `${pad2(i)}:00`), indexOf: (d) => d.getHours() };
  }
  if (period === "week") {
    return { labels: WEEKDAYS, indexOf: (d) => d.getDay() };
  }
  if (period === "month") {
    const days = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    return { labels: Array.from({ length: days }, (_, i) => String(i + 1)), indexOf: (d) => d.getDate() - 1 };
  }
  return { labels: MONTHS, indexOf: (d) => d.getMonth() };
}

export interface CashflowPoint {
  label: string;
  earning: number;
  spend: number;
}

/** Real earning (CREDIT) vs spend (DEBIT) bucketed across the period. No synthetic data. */
export function cashflowSeries(txns: Transaction[], period: Period, offset = 0): CashflowPoint[] {
  const { from, to } = periodWindow(period, offset);
  const { labels, indexOf } = bucketsFor(period, to);
  const earning = labels.map(() => 0);
  const spend = labels.map(() => 0);
  for (const t of txns) {
    const d = new Date(t.occurredAt);
    if (d < from || d > to) continue;
    const i = indexOf(d);
    if (i < 0 || i >= labels.length) continue;
    if (t.direction === "CREDIT") earning[i] += t.amount;
    else spend[i] += t.amount;
  }
  return labels.map((label, i) => ({ label, earning: Math.round(earning[i]), spend: Math.round(spend[i]) }));
}

/** A category's real DEBIT transactions within the period, newest first. */
export function categorySpend(txns: Transaction[], category: string, period: Period, offset = 0): Transaction[] {
  const { from, to } = periodWindow(period, offset);
  return txns
    .filter((t) => t.direction === "DEBIT" && (t.category ?? "Uncategorized") === category)
    .filter((t) => {
      const d = new Date(t.occurredAt);
      return d >= from && d <= to;
    })
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
}

/** Bucket one category's real spend across the period (for the trend chart). */
export function categorySeries(txns: Transaction[], category: string, period: Period, offset = 0): { label: string; value: number }[] {
  const { to } = periodWindow(period, offset);
  const { labels, indexOf } = bucketsFor(period, to);
  const vals = labels.map(() => 0);
  for (const t of categorySpend(txns, category, period, offset)) {
    const i = indexOf(new Date(t.occurredAt));
    if (i >= 0 && i < labels.length) vals[i] += t.amount;
  }
  return labels.map((label, i) => ({ label, value: Math.round(vals[i]) }));
}
