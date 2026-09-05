import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import type { Reminder } from "@/lib/sample";
import { upcomingReminders } from "@/lib/sample";
import { reminderKey, reminderStatus } from "@/lib/reminderStatus";
import type { Forecast } from "@/lib/forecast";
import type { MonthBreakdown } from "@/lib/breakdown";
import { formatINR } from "@/lib/format";

export type Severity = "red" | "amber" | "green" | "info";

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href?: string;
  cta?: string;
}

const ORDER: Record<Severity, number> = { red: 0, amber: 1, green: 2, info: 3 };
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const daysUntil = (iso: string, today: Date) =>
  Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);

export interface InsightInput {
  today?: Date;
  cards: CardSummary[];
  reminders: Reminder[];
  txns: Transaction[];
  thresholds: Record<string, number>;
  breakdown: MonthBreakdown;
  forecast: Forecast;
  reviewCount: number;
  savingsRate: number;
  lastSavingsRate?: number | null;
  /** Reminder occurrences closed by hand, from useReminderPayments(). */
  paidKeys?: ReadonlySet<string>;
}

/**
 * Everything worth the user's attention right now, most urgent first. Every item is computed
 * from the ledger — amounts and dates are never invented.
 */
export function buildInsights(i: InsightInput): Insight[] {
  const today = i.today ?? new Date();
  const out: Insight[] = [];

  // Card bills due soon / overdue.
  for (const c of i.cards) {
    if (c.billDue <= 0 || !c.dueOn) continue;
    const d = daysUntil(c.dueOn, today);
    if (d < 0) {
      out.push({ id: `card-overdue-${c.accountId}`, severity: "red", title: `${c.displayName} bill is overdue`, detail: `${formatINR(c.billDue)} was due ${fmtDay(c.dueOn)}`, href: "/accounts", cta: "View card" });
    } else if (d <= 7) {
      out.push({ id: `card-due-${c.accountId}`, severity: d <= 3 ? "red" : "amber", title: `${formatINR(c.billDue)} card bill due ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}`, detail: `${c.displayName} · due ${fmtDay(c.dueOn)}`, href: "/accounts", cta: "View card" });
    }
    if ((c.utilisationPct ?? 0) >= 30) {
      out.push({ id: `util-${c.accountId}`, severity: "amber", title: `${c.displayName} is ${c.utilisationPct}% utilised`, detail: "Keeping utilisation under 30% protects your credit score", href: "/accounts" });
    }
  }

  // Reminders: overdue and due today (unpaid).
  for (const r of upcomingReminders(i.reminders, 100, 7)) {
    const st = reminderStatus(r.occursOn, r.amount, i.txns, today, reminderKey(r.id, r.occursOn), i.paidKeys);
    if (st.state === "overdue") {
      out.push({ id: `rem-over-${r.id}-${r.occursOn}`, severity: "red", title: `${r.title} looks unpaid`, detail: `${r.amount ? formatINR(r.amount) + " · " : ""}was due ${fmtDay(r.occursOn)}`, href: "/calendar", cta: "Open calendar" });
    } else if (st.state === "due") {
      out.push({ id: `rem-due-${r.id}-${r.occursOn}`, severity: "amber", title: `${r.title} due today`, detail: r.amount ? formatINR(r.amount) : "Amount not set on the reminder", href: "/calendar" });
    }
  }

  // Cash-flow warning from the forecast.
  if (!i.forecast.healthy) {
    out.push({ id: "forecast-low", severity: "red", title: `Balance may dip below your ${formatINR(i.forecast.reserve, { compact: true })} reserve`, detail: `Projected low of ${formatINR(i.forecast.minBalance)} around ${fmtDay(i.forecast.minOn)}`, href: "/calendar" });
  }

  // Budgets breached.
  for (const [cat, limit] of Object.entries(i.thresholds)) {
    if (!limit || limit <= 0) continue;
    const row = i.breakdown.rows.find((r) => r.category === cat);
    if (row && row.total > limit) {
      out.push({ id: `budget-${cat}`, severity: "amber", title: `${cat} is over budget`, detail: `${formatINR(row.total)} of ${formatINR(limit)} this month`, href: `/transactions?month=${i.breakdown.month}&category=${encodeURIComponent(cat)}`, cta: "See transactions" });
    }
  }

  // Categories running well above their 6-month average.
  for (const m of i.breakdown.movers) {
    if (out.some((o) => o.id === `budget-${m.category}`)) continue;
    out.push({ id: `mover-${m.category}`, severity: "amber", title: `${m.category} is ${Math.round(m.deltaPct)}% above your usual`, detail: `${formatINR(m.excess)} more than your 6-month average so far this month`, href: `/transactions?month=${i.breakdown.month}&category=${encodeURIComponent(m.category)}`, cta: "See transactions" });
  }

  // Data quality.
  if (i.reviewCount >= 5) {
    out.push({ id: "review", severity: "info", title: `${i.reviewCount} transactions need a category or account`, detail: "Categorised data makes every number here sharper", href: "/transactions?review=1", cta: "Review" });
  }

  // Positives.
  if (i.lastSavingsRate != null && i.savingsRate > i.lastSavingsRate) {
    out.push({ id: "sr-up", severity: "green", title: "Your savings rate improved", detail: `${i.lastSavingsRate}% → ${i.savingsRate}%`, href: "/analytics" });
  }
  if (i.forecast.healthy && i.forecast.safeToSpend > 0) {
    out.push({ id: "safe", severity: "green", title: `${formatINR(i.forecast.safeToSpend)} safe to spend this month`, detail: `After ${formatINR(i.forecast.committedThisMonth)} of known bills and your ${formatINR(i.forecast.reserve, { compact: true })} reserve`, href: "/transactions" });
  }
  if (i.forecast.salary.amount > 0 && !i.forecast.salary.receivedThisMonth) {
    const ev = i.forecast.events.find((e) => e.kind === "income");
    if (ev) out.push({ id: "salary", severity: "info", title: `Salary expected around ${fmtDay(ev.on)}`, detail: `About ${formatINR(ev.amount)}, based on recent months` });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
