import { useEffect, useState } from "react";
import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { statementsOf } from "@/lib/cards";
import { isoDay } from "@/lib/forecast";

/*
 * A credit-card statement as the bank bills it: one per billing group (or per card on its own
 * bill), with the cards on it, the purchases it covers and what came in against it. The current
 * figures come from the server's card summary; the transaction lists and the history are worked
 * out here from the ledger and the statement dates.
 */

export interface Statement {
  /** The summary for the whole statement (group figures, unbilled summed across its cards). */
  summary: CardSummary;
  /** The cards billed on it, each with its own unbilled spend. */
  members: CardSummary[];
  /** Account ids of those cards. */
  accountIds: number[];
  /** A name for the statement: the card's own, or "ICICI Bank · one statement". */
  name: string;
}

export interface PastStatement {
  on: string; // statement date, yyyy-MM-dd
  from: string; // first day it covers
  to: string; // last day it covers
  dueOn: string;
  billed: number;
  paid: number;
  paidOn: string | null;
  status: "on-time" | "late" | "short" | "unpaid" | "nothing";
}

/** Every statement for these card summaries, in the order the cards come. */
export function statementList(cards: CardSummary[]): Statement[] {
  return statementsOf(cards).map((s) => {
    const members = s.billingGroup ? cards.filter((c) => c.billingGroup === s.billingGroup) : [s];
    return {
      summary: s,
      members,
      accountIds: members.map((m) => m.accountId),
      name: members.length > 1 ? `${s.bank} · one statement` : s.displayName,
    };
  });
}

/** The statement a card is billed on — any card on a shared bill finds the same one. */
export function statementFor(cards: CardSummary[], accountId: number): Statement | null {
  return statementList(cards).find((s) => s.accountIds.includes(accountId)) ?? null;
}

const localDay = (t: Transaction) => isoDay(new Date(t.occurredAt));

/** Same day of the month, `months` away, clamped to the month's length. */
export function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return isoDay(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

const dayBefore = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d - 1));
};

/** Purchases (and refunds) on these cards between two days, inclusive; bill payments left out. */
export function purchasesBetween(txns: Transaction[], accountIds: number[], from: string, to: string): Transaction[] {
  return txns
    .filter((t) => t.accountId != null && accountIds.includes(t.accountId) && !t.settlement)
    .filter((t) => {
      const d = localDay(t);
      return d >= from && d <= to;
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Net of a list of card rows: purchases add, refunds and credits take away. */
export const netOf = (rows: Transaction[]) => rows.reduce((s, t) => s + (t.direction === "DEBIT" ? t.amount : -t.amount), 0);

/** The period the current bill covers: the day after the previous statement up to the day before this one. */
export function billPeriod(s: CardSummary): { from: string; to: string } | null {
  if (!s.lastStatementOn) return null;
  return { from: shiftMonths(s.lastStatementOn, -1), to: dayBefore(s.lastStatementOn) };
}

/**
 * The last few statements before the current one, rebuilt from the ledger: what each covered and
 * the bill payments received before the next statement. It is an estimate — an alert that never
 * arrived makes a cycle look underpaid — and says so where it is shown.
 */
export function pastStatements(txns: Transaction[], st: Statement, count = 6): PastStatement[] {
  const s = st.summary;
  if (!s.lastStatementOn || !s.dueOn) return [];
  const dueGap = Math.round(
    (new Date(`${s.dueOn}T00:00:00`).getTime() - new Date(`${s.lastStatementOn}T00:00:00`).getTime()) / 86_400_000,
  );
  const payments = txns
    .filter((t) => t.accountId != null && st.accountIds.includes(t.accountId) && t.direction === "CREDIT" && t.settlement)
    .map((t) => ({ on: localDay(t), amount: t.amount }));
  const earliest = txns.reduce((min, t) => (t.accountId != null && st.accountIds.includes(t.accountId) && localDay(t) < min ? localDay(t) : min), "9999");

  const out: PastStatement[] = [];
  for (let k = 1; k <= count; k++) {
    const on = shiftMonths(s.lastStatementOn, -k);
    const from = shiftMonths(on, -1);
    if (from < earliest) break; // before the ledger starts: nothing honest to say
    const to = dayBefore(on);
    const next = shiftMonths(on, 1);
    const dueOn = isoDay(new Date(new Date(`${on}T00:00:00`).getTime() + dueGap * 86_400_000));
    const billed = netOf(purchasesBetween(txns, st.accountIds, from, to));
    const paidRows = payments.filter((p) => p.on >= on && p.on < next);
    const paid = paidRows.reduce((sum, p) => sum + p.amount, 0);
    const paidOn = paidRows.length ? paidRows.map((p) => p.on).sort()[paidRows.length - 1] : null;
    const status: PastStatement["status"] =
      billed <= 0
        ? "nothing"
        : paid <= 0
          ? "unpaid"
          : paid + 1 < billed
            ? "short"
            : paidOn && paidOn > dueOn
              ? "late"
              : "on-time";
    out.push({ on, from, to, dueOn, billed, paid, paidOn, status });
  }
  return out;
}

/** Days from today to a yyyy-MM-dd (negative once it has passed). */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today) / 86_400_000);
}

/** "in 6 days", "tomorrow", "today", "3 days ago". */
export function relativeDays(iso: string, now = new Date()): string {
  const d = daysUntil(iso, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

const NETWORK_NAMES: Record<string, string> = { AMEX: "Amex", MASTERCARD: "Mastercard", VISA: "Visa", RUPAY: "RuPay", DINERS: "Diners" };
/** "Amex", "RuPay"… for the network codes the server sends. */
export const networkName = (n: string | null | undefined) => (n ? (NETWORK_NAMES[n.toUpperCase()] ?? n) : "");

/**
 * A link that opens the statement panel over the page it is followed from — relative, so the
 * page stays put. The panel itself reads this parameter (components/StatementPanel).
 */
export const statementHref = (accountId: number) => `?statement=${accountId}`;

// A bill marked paid (or un-marked) changes card figures shown on other pages; they listen for this.
const CHANGED = "jarvis:statements-changed";

/** Tell every page showing card figures to fetch them again. */
export function notifyStatementsChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** A number that goes up whenever a statement changes — add it to a fetch effect's dependencies. */
export function useStatementsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED, bump);
    return () => window.removeEventListener(CHANGED, bump);
  }, []);
  return version;
}
