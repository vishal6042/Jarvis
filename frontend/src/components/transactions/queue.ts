import type { Transaction } from "@/types";
import { merchantLabel } from "@/lib/format";
import { isUncategorised, merchantKey, needsReview, paidToPerson } from "@/components/transactions/shared";
import type { Suggestions } from "@/components/transactions/suggestions";

/*
 * What the review queue holds, worked out from the ledger and the model's suggestions so the
 * page's "Needs a look" count and the queue itself can never disagree.
 */

/** Confidence at which a suggestion is accepted by "Accept all confident suggestions". */
export const CONFIDENT = 0.8;

/** One merchant's rows filed under a category the model thinks is wrong. */
export interface CategoryFix {
  key: string; // dismiss key
  raw: string;
  label: string;
  from: string;
  to: string;
  reason: string | null;
  confidence: number;
  rows: Transaction[];
}

/** A merchant whose alert text the model can name better than the page does. */
export interface NameFix {
  key: string;
  raw: string;
  current: string;
  name: string;
  reason: string | null;
  confidence: number;
  rows: Transaction[];
}

/** A row with no category (or no account), with the model's category when it has one. */
export interface LooseRow {
  txn: Transaction;
  suggested: string | null;
  confidence: number;
  reason: string | null;
}

export interface QueueItems {
  wrong: CategoryFix[];
  names: NameFix[];
  people: Transaction[];
  loose: LooseRow[];
  dups: Transaction[][];
  count: number;
  /** Merchants worth asking the model about: the review rows' and the rows in view. */
  merchants: string[];
  confident: { categories: { ids: number[]; category: string }[]; names: NameFix[] };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function buildQueue({
  periodRows,
  viewRows,
  dups,
  suggestions,
  dismissed,
  admin,
}: {
  /** Rows in the page's date window (the review rows are drawn from these). */
  periodRows: Transaction[];
  /** Rows the list is showing, all filters applied. */
  viewRows: Transaction[];
  dups: Transaction[][];
  suggestions: Suggestions;
  dismissed: ReadonlySet<string>;
  admin: boolean;
}): QueueItems {
  const people = periodRows.filter((t) => paidToPerson(t) && !dismissed.has(`person:${t.id}`));
  const peopleIds = new Set(people.map((t) => t.id));
  const reviewRows = periodRows.filter((t) => needsReview(t) && !peopleIds.has(t.id));

  // The candidates for a suggestion: the review rows and everything in view, once each.
  const pool = new Map<number, Transaction>();
  for (const t of [...reviewRows, ...people, ...viewRows]) pool.set(t.id, t);
  const candidates = Array.from(pool.values());
  const merchants = Array.from(new Set(candidates.map((t) => (t.merchant ?? "").trim()).filter(Boolean)));
  const sug = (t: Transaction) => (t.merchant ? suggestions[merchantKey(t.merchant)] : undefined);

  // (a) Filed under a category the model disagrees with. Purchases only: a credit's category is
  // usually "Income" or a refund, and paired transfers / bill payments are right by construction.
  const wrongMap = new Map<string, CategoryFix>();
  for (const t of candidates) {
    if (t.direction !== "DEBIT" || t.transfer || t.settlement || isUncategorised(t) || peopleIds.has(t.id)) continue;
    const s = sug(t);
    if (!s?.category || norm(s.category) === norm(t.category ?? "") || norm(s.category) === "uncategorized") continue;
    const key = `cat:${merchantKey(t.merchant ?? "")}|${t.category}`;
    if (dismissed.has(key)) continue;
    const cur = wrongMap.get(key);
    if (cur) cur.rows.push(t);
    else
      wrongMap.set(key, {
        key,
        raw: t.merchant ?? "",
        label: merchantLabel(t),
        from: t.category ?? "",
        to: s.category,
        reason: s.reason ?? null,
        confidence: s.confidence ?? 0.5,
        rows: [t],
      });
  }
  const wrong = Array.from(wrongMap.values()).sort((a, b) => b.confidence - a.confidence);

  // (b) A better name — only for rows without an accepted clean name, and only for the
  // administrator, who is the one allowed to save merchant aliases.
  const nameMap = new Map<string, NameFix>();
  if (admin) {
    for (const t of candidates) {
      if (t.merchantNorm || !t.merchant) continue;
      const s = sug(t);
      const name = s?.merchant?.trim();
      if (!name || norm(name) === norm(merchantLabel(t))) continue;
      const key = `name:${merchantKey(t.merchant)}`;
      if (dismissed.has(key)) continue;
      const cur = nameMap.get(key);
      if (cur) cur.rows.push(t);
      else
        nameMap.set(key, {
          key,
          raw: t.merchant,
          current: merchantLabel(t),
          name,
          reason: s?.reason ?? null,
          confidence: s?.confidence ?? 0.5,
          rows: [t],
        });
    }
  }
  const names = Array.from(nameMap.values()).sort((a, b) => b.rows.length - a.rows.length);

  // (d) No category, or no account.
  const loose: LooseRow[] = reviewRows.map((t) => {
    const s = isUncategorised(t) ? sug(t) : undefined;
    const suggested = s?.category && norm(s.category) !== "uncategorized" ? s.category : null;
    return { txn: t, suggested, confidence: suggested ? (s?.confidence ?? 0.5) : 0, reason: suggested ? (s?.reason ?? null) : null };
  });

  // Probable duplicates that touch this window.
  const inPeriod = new Set(periodRows.map((t) => t.id));
  const shownDups = dups.filter((pair) => pair.some((t) => inPeriod.has(t.id)));

  const confidentCats = [
    ...wrong.filter((w) => w.confidence >= CONFIDENT).map((w) => ({ ids: w.rows.map((r) => r.id), category: w.to })),
    ...loose.filter((l) => l.suggested && l.confidence >= CONFIDENT).map((l) => ({ ids: [l.txn.id], category: l.suggested as string })),
  ];

  return {
    wrong,
    names,
    people,
    loose,
    dups: shownDups,
    count: wrong.length + names.length + people.length + loose.length + shownDups.length,
    merchants,
    confident: { categories: confidentCats, names: names.filter((n) => n.confidence >= CONFIDENT) },
  };
}
