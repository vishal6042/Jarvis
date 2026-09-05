import type { Transaction } from "@/types";

export type PayState = "paid" | "due" | "overdue" | "upcoming";
export interface PayStatus {
  state: PayState;
  txn?: Transaction;
  /** "manual" when the user closed this occurrence themselves rather than it being matched. */
  source?: "auto" | "manual";
}

/** Key for one dated occurrence of a reminder, as used by the paid-occurrence set. */
export const reminderKey = (reminderId: string | number, occursOn: string) => `${reminderId}:${occursOn}`;

const DAY = 86_400_000;

/**
 * Has a reminder occurrence been paid? Marking it paid on the Calendar page always wins — that
 * is the only way to close a bill whose amount varies. Otherwise a debit of about the reminder's
 * amount (±2%) dated within 5 days before to 2 days after the due date counts as the payment.
 * Transfers and card bill settlements are ignored. Without an amount only the date can be judged.
 */
export function reminderStatus(
  occursOn: string,
  amount: number | null | undefined,
  txns: Transaction[],
  now: Date = new Date(),
  paidKey?: string | null,
  paidKeys?: ReadonlySet<string>,
): PayStatus {
  if (paidKey && paidKeys?.has(paidKey)) return { state: "paid", source: "manual" };
  const due = new Date(`${occursOn}T00:00:00`);
  if (amount && amount > 0) {
    const lo = due.getTime() - 5 * DAY;
    const hi = due.getTime() + 2 * DAY + DAY;
    const tol = amount * 0.02;
    const match = txns.find((t) => {
      if (t.direction !== "DEBIT" || t.transfer || t.settlement) return false;
      if (Math.abs(t.amount - amount) > tol) return false;
      const at = new Date(t.occurredAt).getTime();
      return at >= lo && at < hi;
    });
    if (match) return { state: "paid", txn: match, source: "auto" };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / DAY);
  if (days < -3) return { state: "overdue" };
  if (days <= 0) return { state: "due" };
  return { state: "upcoming" };
}

export const PAY_STATE_META: Record<PayState, { label: string; color: string }> = {
  paid: { label: "Paid", color: "#10b981" },
  due: { label: "Due", color: "#f59e0b" },
  overdue: { label: "Overdue", color: "#f43f5e" },
  upcoming: { label: "Upcoming", color: "#6b7280" },
};
