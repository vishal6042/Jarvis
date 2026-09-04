import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { upcomingReminders, type Reminder } from "@/lib/sample";
import { reminderStatus } from "@/lib/reminderStatus";

const DAY = 86_400_000;

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Is this row real money moving in/out of the household (not a shuffle between own accounts)? */
export const isRealFlow = (t: Transaction) => !t.transfer && !t.settlement;

export interface SalaryEstimate {
  /** Typical monthly income credit (median of the last three months' biggest savings credits). */
  amount: number;
  /** Day of month it usually lands (median). */
  dayOfMonth: number;
  /** Has an income credit of that size already landed this month? */
  receivedThisMonth: boolean;
  /** How many months the estimate is based on (0 = no idea). */
  basis: number;
}

/**
 * Infer salary from history: for each of the last three complete months take the largest CREDIT
 * on a savings-type account that isn't a transfer, then use the median amount and landing day.
 */
export function inferSalary(txns: Transaction[], today = new Date()): SalaryEstimate {
  const credits = txns.filter(
    (t) => t.direction === "CREDIT" && isRealFlow(t) && t.accountName != null && !/card/i.test(t.accountName),
  );
  const perMonth: { amount: number; day: number }[] = [];
  for (let back = 1; back <= 3; back++) {
    const m = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = credits.filter((t) => t.occurredAt.startsWith(key));
    if (inMonth.length === 0) continue;
    const top = inMonth.reduce((a, b) => (b.amount > a.amount ? b : a));
    perMonth.push({ amount: top.amount, day: new Date(top.occurredAt).getUTCDate() });
  }
  if (perMonth.length === 0) return { amount: 0, dayOfMonth: 31, receivedThisMonth: false, basis: 0 };
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const amount = median(perMonth.map((p) => p.amount));
  const dayOfMonth = median(perMonth.map((p) => p.day));
  const thisKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const receivedThisMonth = credits.some((t) => t.occurredAt.startsWith(thisKey) && t.amount >= amount * 0.6);
  return { amount, dayOfMonth, receivedThisMonth, basis: perMonth.length };
}

export type EventKind = "income" | "reminder" | "card" | "start" | "end";

export interface ForecastEvent {
  on: string; // yyyy-MM-dd
  label: string;
  detail?: string;
  /** Signed: income positive, outflows negative; 0 for informational rows. */
  amount: number;
  kind: EventKind;
  /** Balance after this event. */
  balanceAfter: number;
  href?: string;
  /** Amount unknown (a reminder without an amount) — shown, not counted. */
  unknownAmount?: boolean;
}

export interface Forecast {
  today: string;
  startBalance: number;
  events: ForecastEvent[];
  projected: number;
  projectedOn: string;
  minBalance: number;
  minOn: string;
  reserve: number;
  healthy: boolean;
  salary: SalaryEstimate;
  /** Committed outflows (with known amounts) between today and the end of this month. */
  committedThisMonth: number;
  /** Income still expected before month end. */
  incomeThisMonth: number;
  /** startBalance + incomeThisMonth − committedThisMonth − reserve, floored at 0. */
  safeToSpend: number;
  /** Outflows in the window we could not put a number on. */
  unknownCount: number;
}

export interface ForecastInput {
  today?: Date;
  balance: number;
  txns: Transaction[];
  reminders: Reminder[];
  cards: CardSummary[];
  reserve: number;
  horizonDays?: number;
}

/**
 * Project the savings balance over the next N days from things we know are coming: reminder
 * occurrences (skipping ones already paid), credit-card bills with a due date, and the inferred
 * salary if it hasn't landed yet. Also derives "safe to spend" for the rest of this month.
 */
export function buildForecast({
  today = new Date(),
  balance,
  txns,
  reminders,
  cards,
  reserve,
  horizonDays = 30,
}: ForecastInput): Forecast {
  const t0 = startOfDay(today);
  const horizonEnd = new Date(t0.getTime() + horizonDays * DAY);
  const monthEnd = new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
  const salary = inferSalary(txns, t0);

  const raw: Omit<ForecastEvent, "balanceAfter">[] = [];

  // Reminders: every occurrence in the window that isn't already paid.
  for (const r of upcomingReminders(reminders, 100, horizonDays)) {
    const st = reminderStatus(r.occursOn, r.amount, txns, t0);
    if (st.state === "paid") continue;
    // Card bill reminders without an amount duplicate the card bills below — skip them.
    if (!r.amount && /card/i.test(r.title) && cards.some((c) => c.billDue > 0)) continue;
    raw.push({
      on: r.occursOn,
      label: r.title,
      detail: r.type ? r.type.charAt(0) + r.type.slice(1).toLowerCase() : undefined,
      amount: r.amount ? -r.amount : 0,
      kind: "reminder",
      href: "/calendar",
      unknownAmount: !r.amount,
    });
  }

  // Card bills that still have a balance due and a due date inside the window.
  for (const c of cards) {
    if (c.billDue > 0 && c.dueOn) {
      const due = new Date(`${c.dueOn}T00:00:00`);
      if (due >= t0 && due <= horizonEnd) {
        raw.push({ on: c.dueOn, label: `${c.displayName} bill`, detail: "Card payment", amount: -c.billDue, kind: "card", href: "/accounts" });
      }
    }
  }

  // Salary, if it usually lands inside the window and hasn't yet this month.
  if (salary.amount > 0 && !salary.receivedThisMonth) {
    const lastDay = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate();
    const landing = new Date(t0.getFullYear(), t0.getMonth(), Math.min(salary.dayOfMonth, lastDay));
    const on = landing < t0 ? new Date(t0.getFullYear(), t0.getMonth() + 1, Math.min(salary.dayOfMonth, 28)) : landing;
    if (on <= horizonEnd) {
      raw.push({
        on: isoDay(on),
        label: "Salary (expected)",
        detail: `Based on the last ${salary.basis} month${salary.basis === 1 ? "" : "s"}`,
        amount: salary.amount,
        kind: "income",
      });
    }
  }

  raw.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : b.amount - a.amount));

  let running = balance;
  let minBalance = balance;
  let minOn = isoDay(t0);
  const events: ForecastEvent[] = [{ on: isoDay(t0), label: "Today", amount: 0, kind: "start", balanceAfter: balance }];
  for (const e of raw) {
    running += e.amount;
    if (running < minBalance) {
      minBalance = running;
      minOn = e.on;
    }
    events.push({ ...e, balanceAfter: running });
  }
  events.push({ on: isoDay(horizonEnd), label: "Projected balance", amount: 0, kind: "end", balanceAfter: running });

  // Safe to spend for the rest of THIS month.
  const monthEndIso = isoDay(monthEnd);
  const committedThisMonth = raw
    .filter((e) => e.amount < 0 && e.on <= monthEndIso)
    .reduce((s, e) => s + -e.amount, 0);
  const incomeThisMonth = raw.filter((e) => e.amount > 0 && e.on <= monthEndIso).reduce((s, e) => s + e.amount, 0);
  const safeToSpend = Math.max(0, balance + incomeThisMonth - committedThisMonth - reserve);

  return {
    today: isoDay(t0),
    startBalance: balance,
    events,
    projected: running,
    projectedOn: isoDay(horizonEnd),
    minBalance,
    minOn,
    reserve,
    healthy: minBalance >= reserve,
    salary,
    committedThisMonth,
    incomeThisMonth,
    safeToSpend,
    unknownCount: raw.filter((e) => e.unknownAmount).length,
  };
}
