import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { KIND_META, occurrencesInMonth, REMINDER_META, upcomingReminders, type Investment, type Loan, type Reminder } from "@/lib/sample";
import { inferSalary } from "@/lib/forecast";

/**
 * Things the financial calendar knows about beyond hand-made reminders: credit-card due and
 * statement dates, the expected salary credit, RD/SIP instalments and loan EMIs. Everything is
 * derived from data already in the app, so nothing here needs to be maintained by hand.
 */
export type FinEventKind = "card-due" | "card-statement" | "salary" | "sip" | "emi" | "reminder";

export const FIN_EVENT_META: Record<FinEventKind, { label: string; color: string }> = {
  "card-due": { label: "Card due", color: "#f43f5e" },
  "card-statement": { label: "Statement", color: "#64748b" },
  salary: { label: "Salary", color: "#10b981" },
  sip: { label: "SIP / RD", color: "#6366f1" },
  emi: { label: "EMI", color: "#ef4444" },
  reminder: { label: "Reminder", color: "#a855f7" },
};

export interface FinEvent {
  id: string;
  on: string; // yyyy-MM-dd
  kind: FinEventKind;
  title: string;
  detail?: string;
  amount?: number;
  direction: "in" | "out" | "info";
  color: string;
  href?: string;
}

export interface FinEventInput {
  year: number;
  month: number; // 0-based
  cards: CardSummary[];
  txns: Transaction[];
  investments: Investment[];
  loans: Loan[];
  reminders: Reminder[];
  today?: Date;
  /** Reminder occurrences the user closed by hand — excluded from what is still due. */
  paidKeys?: ReadonlySet<string>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const dayOf = (s: string) => Number(s.slice(8, 10));
const monthIndex = (y: number, m: number) => y * 12 + m;
const monthOf = (s: string) => monthIndex(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1);
const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Roll a known date forward month by month into the requested month, clamping the day. */
function inMonth(dateStr: string, y: number, m: number): string | null {
  if (monthOf(dateStr) > monthIndex(y, m)) return null; // not started yet
  return iso(y, m, Math.min(dayOf(dateStr), daysIn(y, m)));
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(50, b * 0.02);

/** Derived events for one month (reminders are NOT included; the calendar already has those). */
export function financialEvents(i: FinEventInput): FinEvent[] {
  const { year: y, month: m, today = new Date() } = i;
  const out: FinEvent[] = [];
  const thisMonth = monthIndex(today.getFullYear(), today.getMonth());
  const target = monthIndex(y, m);
  const remindersInMonth = i.reminders.filter((r) => r.repeat === "monthly" || monthOf(r.date) === target);

  // Credit cards: bill due + statement generation (cycles repeat monthly).
  for (const c of i.cards) {
    const due = c.dueOn ? inMonth(c.dueOn, y, m) : null;
    if (due && c.dueOn) {
      const isCurrentBill = monthOf(c.dueOn) === target;
      out.push({
        id: `card-due-${c.accountId}-${due}`,
        on: due,
        kind: "card-due",
        title: `${c.displayName} bill due`,
        detail: isCurrentBill ? (c.billDue > 0 ? "Unpaid statement" : "Statement paid") : "Expected due date",
        amount: isCurrentBill && c.billDue > 0 ? c.billDue : undefined,
        direction: "out",
        color: FIN_EVENT_META["card-due"].color,
        href: "/accounts",
      });
    }
    const stmt = c.nextStatementOn ? inMonth(c.nextStatementOn, y, m) : null;
    if (stmt && c.nextStatementOn) {
      out.push({
        id: `card-stmt-${c.accountId}-${stmt}`,
        on: stmt,
        kind: "card-statement",
        title: `${c.displayName} statement`,
        detail: c.unbilled > 0 && monthOf(c.nextStatementOn) === target ? `${inr(c.unbilled)} unbilled so far` : undefined,
        direction: "info",
        color: FIN_EVENT_META["card-statement"].color,
        href: "/accounts",
      });
    }
  }

  // Expected salary (only from this month on; history already shows the real credit).
  if (target >= thisMonth) {
    const sal = inferSalary(i.txns, today);
    if (sal.basis > 0 && sal.amount > 0 && !(target === thisMonth && sal.receivedThisMonth)) {
      const on = iso(y, m, Math.min(sal.dayOfMonth, daysIn(y, m)));
      out.push({
        id: `salary-${on}`,
        on,
        kind: "salary",
        title: "Expected salary",
        detail: `Based on the last ${sal.basis} month${sal.basis > 1 ? "s" : ""}`,
        amount: sal.amount,
        direction: "in",
        color: FIN_EVENT_META.salary.color,
        href: "/transactions?type=CREDIT",
      });
    }
  }

  // RD / SIP instalments, unless a reminder already covers the same amount.
  for (const inv of i.investments) {
    const sip = inv.sip ?? 0;
    if (sip <= 0) continue;
    const start = inv.commencementDate ?? inv.openingDate;
    if (!start) continue;
    if (inv.maturityDate && monthOf(inv.maturityDate) < target) continue;
    const on = inMonth(start, y, m);
    if (!on) continue;
    const covered = remindersInMonth.some((r) => (r.type === "INVESTMENT" || r.type === "SIP") && r.amount != null && near(r.amount, sip));
    if (covered) continue;
    out.push({
      id: `sip-${inv.id}-${on}`,
      on,
      kind: "sip",
      title: `${inv.name} · ${KIND_META[inv.kind].label}`,
      detail: inv.kind === "RD" ? "Monthly deposit" : "SIP instalment",
      amount: sip,
      direction: "out",
      color: KIND_META[inv.kind].color,
      href: "/investments",
    });
  }

  // Loan EMIs, unless an EMI reminder already covers them.
  for (const loan of i.loans) {
    if (!loan.startDate || loan.outstanding <= 0 || loan.emi <= 0) continue;
    if (loan.endDate && monthOf(loan.endDate) < target) continue;
    const on = inMonth(loan.startDate, y, m);
    if (!on) continue;
    const covered = remindersInMonth.some((r) => r.type === "EMI" && r.amount != null && near(r.amount, loan.emi));
    if (covered) continue;
    out.push({
      id: `emi-${loan.id}-${on}`,
      on,
      kind: "emi",
      title: `${loan.lender} EMI`,
      detail: `${loan.rate}% · ${inr(loan.outstanding)} outstanding`,
      amount: loan.emi,
      direction: "out",
      color: FIN_EVENT_META.emi.color,
      href: "/loans",
    });
  }

  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

export interface OutflowSummary {
  from: string;
  to: string;
  total: number; // known outflows
  income: number; // known inflows (salary)
  unknownCount: number; // reminders without an amount
  items: FinEvent[]; // everything in the window, dated, sorted
}

/** Everything due in the next `days` days: reminders + derived events, with totals. */
export function upcomingOutflows(days: number, input: Omit<FinEventInput, "year" | "month">): OutflowSummary {
  const today = input.today ?? new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const from = iso(start.getFullYear(), start.getMonth(), start.getDate());
  const to = iso(end.getFullYear(), end.getMonth(), end.getDate());

  const items: FinEvent[] = [];
  for (const r of upcomingReminders(input.reminders, 200, days)) {
    // Already paid (marked on the Calendar page) — no longer money going out.
    if (input.paidKeys?.has(`${r.id}:${r.occursOn}`)) continue;
    items.push({
      id: `rem-${r.id}-${r.occursOn}`,
      on: r.occursOn,
      kind: "reminder",
      title: r.title,
      detail: REMINDER_META[r.type].label,
      amount: r.amount,
      direction: "out",
      color: REMINDER_META[r.type].color,
      href: "/calendar",
    });
  }
  const months = new Set<string>([`${start.getFullYear()}-${start.getMonth()}`, `${end.getFullYear()}-${end.getMonth()}`]);
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    for (const e of financialEvents({ ...input, year: y, month: m, today })) {
      if (e.on >= from && e.on <= to) items.push(e);
    }
  }
  items.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const total = items.filter((e) => e.direction === "out" && e.amount != null).reduce((s, e) => s + (e.amount ?? 0), 0);
  const income = items.filter((e) => e.direction === "in" && e.amount != null).reduce((s, e) => s + (e.amount ?? 0), 0);
  const unknownCount = items.filter((e) => e.direction === "out" && e.amount == null && e.kind !== "card-due").length;
  return { from, to, total, income, unknownCount, items };
}

// ---------------------------------------------------------------------------------------------
// Agenda: one dated list mixing hand-made reminders with everything derived (card dues, salary,
// RD/SIP instalments, loan EMIs), for a date range. Used by the Calendar's Upcoming list and the
// dashboard's "Due this month", so both show the same thing.
// ---------------------------------------------------------------------------------------------

export interface AgendaRow {
  key: string;
  on: string; // yyyy-MM-dd
  title: string;
  detail?: string;
  amount?: number | null;
  direction: "in" | "out" | "info";
  color: string;
  badge: string;
  href?: string;
  /** Set when the row is a hand-made reminder, so it can be edited, deleted or marked paid. */
  reminderId?: string;
  paid?: boolean;
}

/** Reminder occurrences between two yyyy-MM-dd dates (inclusive), monthly repeats expanded. */
function reminderOccurrencesBetween(reminders: Reminder[], from: string, to: string) {
  const out: { r: Reminder; on: string }[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const map = occurrencesInMonth(reminders, d.getFullYear(), d.getMonth());
    for (const [on, rs] of Object.entries(map)) {
      if (on < from || on > to) continue;
      for (const r of rs) out.push({ r, on });
    }
  }
  return out;
}

/**
 * Everything happening between two dates, newest last. Paid reminder occurrences are kept but
 * flagged, so a month view can show what has already been settled.
 */
export function agendaBetween(
  from: string,
  to: string,
  input: Omit<FinEventInput, "year" | "month">,
): AgendaRow[] {
  const rows: AgendaRow[] = [];
  for (const { r, on } of reminderOccurrencesBetween(input.reminders, from, to)) {
    rows.push({
      key: `rem-${r.id}-${on}`,
      on,
      title: r.title,
      detail: REMINDER_META[r.type].label,
      amount: r.amount ?? null,
      direction: "out",
      color: REMINDER_META[r.type].color,
      badge: REMINDER_META[r.type].label,
      reminderId: String(r.id),
      paid: input.paidKeys?.has(`${r.id}:${on}`) ?? false,
    });
  }
  const months = new Set<string>();
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    for (const e of financialEvents({ ...input, year: y, month: m })) {
      if (e.on < from || e.on > to) continue;
      rows.push({
        key: e.id,
        on: e.on,
        title: e.title,
        detail: e.detail,
        amount: e.amount ?? null,
        direction: e.direction,
        color: e.color,
        badge: FIN_EVENT_META[e.kind].label,
        href: e.href,
        // A card bill with nothing left to pay is already settled.
        paid: e.kind === "card-due" && (e.amount == null || e.amount <= 0),
      });
    }
  }
  return rows.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

/** First and last day of a month as yyyy-MM-dd. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: iso(year, month, 1), to: iso(year, month, daysIn(year, month)) };
}
