import type { Account, PreviewTransaction, Transaction } from "@/types";
import { localDay } from "@/lib/report";

const DAY_MS = 86_400_000;
const dayNumber = (isoDate: string) => Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10))) / DAY_MS;

/**
 * Which statement rows the ledger already has from an SMS or email alert: same account, same
 * direction, an amount within ₹1 and a date within a day either side. A statement words a payment
 * differently from the alert, so the two never share a dedup hash; this mirrors the check the
 * backend makes when saving (TransactionService, "existsAlertTwin"), so a marked row is skipped
 * rather than counted twice. Rows from earlier statement imports are not alerts and are left to
 * the exact duplicate check.
 *
 * `last4For` says which account a row belongs to: its own card number on a multi-card statement,
 * else the statement's account.
 */
export function alreadyRecorded(
  rows: PreviewTransaction[],
  last4For: (row: PreviewTransaction) => string | null,
  accounts: Account[],
  txns: Transaction[],
): boolean[] {
  const byAccount = new Map<number, { day: number; amount: number; direction: Transaction["direction"] }[]>();
  for (const t of txns) {
    if (t.accountId == null || t.source === "STATEMENT") continue;
    const list = byAccount.get(t.accountId) ?? [];
    list.push({ day: dayNumber(localDay(t)), amount: t.amount, direction: t.direction });
    byAccount.set(t.accountId, list);
  }
  return rows.map((row) => {
    const last4 = last4For(row);
    if (!last4 || !row.occurredOn) return false;
    const day = dayNumber(row.occurredOn);
    return accounts
      .filter((a) => a.last4 === last4)
      .some((a) =>
        (byAccount.get(a.id) ?? []).some((t) => t.direction === row.direction && Math.abs(t.amount - row.amount) <= 1 && Math.abs(t.day - day) <= 1),
      );
  });
}
